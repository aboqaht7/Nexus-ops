import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { logger } from "./logger.js";

const DATA_DIR = join(process.cwd(), "data");
const BOT_ENVS_DIR = join(DATA_DIR, "bot-envs");

const ENC_SCHEME = "aes-256-gcm";
const ENC_VERSION = "v1";
const KDF_SALT = "nexusops-secrets-salt-v1";

/**
 * AES-256-GCM symmetric encryption for per-bot env vars / secrets.
 * Master key = scrypt(SESSION_SECRET, KDF_SALT). If SESSION_SECRET is missing
 * we fall back to a static dev key — but we LOG a warning so it doesn't slip
 * silently into production.
 */
function getMasterKey(): Buffer {
  const sec = process.env["SESSION_SECRET"];
  if (!sec || sec.length < 16) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("FATAL: SESSION_SECRET must be set (and ≥16 chars) in production for secret encryption");
    }
    logger.warn("SESSION_SECRET missing or short — using dev fallback key (NEVER use in production)");
    return scryptSync("dev-fallback-key-do-not-use-in-prod", KDF_SALT, 32);
  }
  return scryptSync(sec, KDF_SALT, 32);
}

let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (!cachedKey) cachedKey = getMasterKey();
  return cachedKey;
}

interface EncryptedBlob {
  v: typeof ENC_VERSION;
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
}

function isEncryptedBlob(x: unknown): x is EncryptedBlob {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { v?: unknown }).v === ENC_VERSION &&
    typeof (x as { iv?: unknown }).iv === "string" &&
    typeof (x as { tag?: unknown }).tag === "string" &&
    typeof (x as { ct?: unknown }).ct === "string"
  );
}

function encryptJson(plain: Record<string, string>): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENC_SCHEME, masterKey(), iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(plain), "utf-8"),
    cipher.final(),
  ]);
  return {
    v: ENC_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
}

function decryptJson(blob: EncryptedBlob): Record<string, string> {
  const decipher = createDecipheriv(
    ENC_SCHEME,
    masterKey(),
    Buffer.from(blob.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ct, "base64")),
    decipher.final(),
  ]);
  const parsed: unknown = JSON.parse(pt.toString("utf-8"));
  if (typeof parsed !== "object" || parsed === null) return {};
  // Coerce all values to strings; reject prototype-pollution keys
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function ensureDirs(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BOT_ENVS_DIR)) mkdirSync(BOT_ENVS_DIR, { recursive: true });
}

function envPath(botId: string): string {
  return join(BOT_ENVS_DIR, `${botId}.json`);
}

/**
 * Read a bot's secrets, transparently decrypting if encrypted.
 * If the file is legacy plain-JSON, we read it and re-write it encrypted.
 */
export function readSecrets(botId: string): Record<string, string> {
  const p = envPath(botId);
  if (!existsSync(p)) return {};
  let raw: string;
  try {
    raw = readFileSync(p, "utf-8");
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn({ botId }, "Bot env file is malformed JSON — ignoring");
    return {};
  }
  if (isEncryptedBlob(parsed)) {
    try {
      return decryptJson(parsed);
    } catch (err) {
      logger.error({ botId, err }, "Failed to decrypt bot secrets");
      return {};
    }
  }
  // Legacy plain JSON — migrate in-place. writeSecrets uses tmp+rename which
  // is atomic on POSIX, so concurrent migration attempts are safe (last write
  // wins; both produce equivalent encrypted output of the same plaintext).
  if (typeof parsed === "object" && parsed !== null) {
    const plain: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (typeof v === "string") plain[k] = v;
    }
    try {
      writeSecrets(botId, plain);
      logger.info({ botId, count: Object.keys(plain).length }, "Migrated plain env to encrypted at rest");
    } catch (err) {
      logger.warn({ botId, err: (err as Error).message }, "Failed to migrate legacy env to encrypted (returning plain)");
    }
    return plain;
  }
  return {};
}

export function writeSecrets(botId: string, vars: Record<string, string>): void {
  ensureDirs();
  const blob = encryptJson(vars);
  // Atomic write: tmp file (mode 0o600 honored on creation) + rename. This
  // also guarantees the on-disk perms even when the destination already
  // exists with looser perms (writeFileSync wouldn't change them on overwrite).
  const dest = envPath(botId);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(blob, null, 2), { mode: 0o600 });
  renameSync(tmp, dest);
}

const KEY_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;

export function isValidSecretKey(k: unknown): k is string {
  return typeof k === "string" && KEY_RE.test(k);
}

export function setSecret(botId: string, key: string, value: string): void {
  if (!isValidSecretKey(key)) {
    throw new Error("Invalid key — must match /^[A-Z_][A-Z0-9_]{0,63}$/");
  }
  if (typeof value !== "string" || value.length > 16384) {
    throw new Error("Invalid value — must be string ≤ 16KB");
  }
  const cur = readSecrets(botId);
  cur[key] = value;
  writeSecrets(botId, cur);
}

export function deleteSecret(botId: string, key: string): boolean {
  const cur = readSecrets(botId);
  if (!(key in cur)) return false;
  delete cur[key];
  writeSecrets(botId, cur);
  return true;
}

export interface MaskedSecret {
  key: string;
  preview: string;
  length: number;
}

export function listSecretsMasked(botId: string): MaskedSecret[] {
  const cur = readSecrets(botId);
  return Object.entries(cur).map(([key, value]) => ({
    key,
    // Show first 2 chars + bullets — enough to recognize without leaking
    preview: value.length <= 4
      ? "•".repeat(value.length)
      : value.slice(0, 2) + "•".repeat(Math.min(value.length - 2, 8)),
    length: value.length,
  }));
}
