import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const KV_DIR = join(process.cwd(), "data", "bot-kv");

function ensureDir(): void {
  if (!existsSync(KV_DIR)) mkdirSync(KV_DIR, { recursive: true });
}

const dbCache = new Map<string, DatabaseSync>();

function getDb(botId: string): DatabaseSync {
  let db = dbCache.get(botId);
  if (db) return db;
  ensureDir();
  const file = join(KV_DIR, `${botId}.db`);
  db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kv_updated_at ON kv(updated_at);
  `);
  dbCache.set(botId, db);
  return db;
}

export interface KvEntry {
  key: string;
  value: string;
  updatedAt: number;
}

const MAX_KEY_LEN = 512;
const MAX_VALUE_BYTES = 1024 * 1024; // 1MB per value

export function kvIsValidKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LEN;
}

export function kvGet(botId: string, key: string): KvEntry | null {
  if (!kvIsValidKey(key)) return null;
  const row = getDb(botId)
    .prepare("SELECT key, value, updated_at FROM kv WHERE key = ?")
    .get(key) as { key: string; value: string; updated_at: number } | undefined;
  if (!row) return null;
  return { key: row.key, value: row.value, updatedAt: row.updated_at };
}

export function kvSet(botId: string, key: string, value: string): KvEntry {
  if (!kvIsValidKey(key)) throw new Error("invalid key");
  if (typeof value !== "string") throw new Error("value must be a string");
  if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
    throw new Error(`value too large (max ${MAX_VALUE_BYTES} bytes)`);
  }
  const ts = Date.now();
  getDb(botId)
    .prepare(
      "INSERT INTO kv(key,value,updated_at) VALUES(?,?,?) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    )
    .run(key, value, ts);
  return { key, value, updatedAt: ts };
}

export function kvDelete(botId: string, key: string): boolean {
  if (!kvIsValidKey(key)) return false;
  const r = getDb(botId).prepare("DELETE FROM kv WHERE key = ?").run(key);
  return Number(r.changes) > 0;
}

export function kvList(
  botId: string,
  opts: { prefix?: string; limit?: number; offset?: number } = {},
): { entries: KvEntry[]; total: number } {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);
  const db = getDb(botId);
  let where = "";
  const params: string[] = [];
  if (opts.prefix) {
    where = " WHERE key LIKE ? ESCAPE '\\'";
    params.push(opts.prefix.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_") + "%");
  }
  const total = (db.prepare("SELECT COUNT(*) AS n FROM kv" + where).get(...params) as { n: number }).n;
  const rows = db
    .prepare("SELECT key, value, updated_at FROM kv" + where + " ORDER BY key LIMIT ? OFFSET ?")
    .all(...params, limit as unknown as string, offset as unknown as string) as Array<{ key: string; value: string; updated_at: number }>;
  return {
    entries: rows.map(r => ({ key: r.key, value: r.value, updatedAt: r.updated_at })),
    total,
  };
}

export function kvClear(botId: string): number {
  const r = getDb(botId).prepare("DELETE FROM kv").run();
  return Number(r.changes);
}

export function kvClose(botId: string): void {
  const db = dbCache.get(botId);
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    dbCache.delete(botId);
  }
}

export function kvDbPath(botId: string): string {
  ensureDir();
  return join(KV_DIR, `${botId}.db`);
}
