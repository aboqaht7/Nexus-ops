import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 5 * 1024 * 1024;
const GIT_AUTHOR_NAME = "Agent-4";
const GIT_AUTHOR_EMAIL = "agent-4@nexusops.local";
const MAX_LOG_ENTRIES = 100;
const SUBJECT_MAX_LEN = 200;

export interface Checkpoint {
  sha: string;
  shortSha: string;
  subject: string;
  createdAt: string; // ISO
  isAutomatic: boolean;
}

const SHA_RE = /^[a-f0-9]{7,40}$/;
export function isValidSha(sha: unknown): sha is string {
  return typeof sha === "string" && SHA_RE.test(sha);
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    env: {
      // Strip user gitconfig influence; keep PATH so git itself can be found
      PATH: process.env["PATH"] ?? "",
      // HOME stays as a junk dir we don't write to, NOT the bot dir — otherwise
      // a bot writing its own .gitconfig could inject aliases or core.editor
      // and achieve RCE. We also pin GIT_CONFIG_GLOBAL=/dev/null to be safe.
      HOME: "/tmp",
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
    },
  });
}

async function isRepo(cwd: string): Promise<boolean> {
  if (!existsSync(join(cwd, ".git"))) return false;
  try {
    await runGit(cwd, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

async function ensureRepo(cwd: string): Promise<void> {
  if (await isRepo(cwd)) return;
  if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });
  await runGit(cwd, ["init", "-q", "-b", "main"]);
  // Local-only ignore so we never version dependency caches
  const ignorePath = join(cwd, ".gitignore");
  if (!existsSync(ignorePath)) {
    writeFileSync(ignorePath, [
      "node_modules/",
      "site-packages/",
      ".pythonlibs/",
      "__pycache__/",
      "*.pyc",
      ".replit/",
      ".replit-artifact/",
      ".DS_Store",
      "*.log",
    ].join("\n") + "\n", "utf-8");
  }
  await runGit(cwd, ["add", "-A"]);
  // Empty initial commit so HEAD always exists, even with no files
  try {
    await runGit(cwd, ["commit", "-q", "--allow-empty", "-m", "Initial checkpoint"]);
  } catch (err) {
    logger.warn({ err, cwd }, "git initial commit failed (likely already exists)");
  }
}

function sanitizeSubject(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, SUBJECT_MAX_LEN) || "Checkpoint";
}

/**
 * Snapshot the current working tree as a new commit.
 * Returns the sha of the created commit, or null if there were no changes
 * (and skipIfClean=true). Callers can pass skipIfClean=false to force an
 * empty commit (used for backup snapshots before a restore).
 */
export async function snapshot(
  botDir: string,
  subject: string,
  opts: { isAutomatic?: boolean; skipIfClean?: boolean } = {},
): Promise<string | null> {
  const { isAutomatic = false, skipIfClean = true } = opts;
  await ensureRepo(botDir);
  await runGit(botDir, ["add", "-A"]);
  if (skipIfClean) {
    const { stdout } = await runGit(botDir, ["status", "--porcelain"]);
    if (!stdout.trim()) return null;
  }
  const message = (isAutomatic ? "[auto] " : "") + sanitizeSubject(subject);
  await runGit(botDir, [
    "commit",
    "-q",
    skipIfClean ? "--no-allow-empty" : "--allow-empty",
    "-m", message,
  ]);
  const { stdout } = await runGit(botDir, ["rev-parse", "HEAD"]);
  return stdout.trim();
}

export async function listCheckpoints(botDir: string): Promise<Checkpoint[]> {
  if (!(await isRepo(botDir))) return [];
  // %x1f = unit separator, safer than | because subjects may contain |
  const { stdout } = await runGit(botDir, [
    "log",
    "--pretty=format:%H%x1f%h%x1f%s%x1f%cI",
    `-n`, String(MAX_LOG_ENTRIES),
  ]);
  if (!stdout.trim()) return [];
  return stdout
    .split("\n")
    .map(line => {
      const [sha, shortSha, subjectRaw, createdAt] = line.split("\x1f");
      if (!sha || !shortSha || !createdAt) return null;
      const subject = subjectRaw ?? "";
      const isAutomatic = subject.startsWith("[auto] ");
      return {
        sha,
        shortSha,
        subject: isAutomatic ? subject.slice(7) : subject,
        createdAt,
        isAutomatic,
      } satisfies Checkpoint;
    })
    .filter((c): c is Checkpoint => c !== null);
}

/**
 * Restore the working tree to a given commit, after first taking a backup
 * snapshot of the current state. We use `read-tree --reset -u <sha>` to
 * update both the index and working tree without changing HEAD, then create
 * a new commit on top so history is linear and nothing is lost.
 */
export async function restoreCheckpoint(botDir: string, sha: string): Promise<{
  backupSha: string | null;
  restoredFromSha: string;
  newSha: string;
}> {
  if (!(await isRepo(botDir))) throw new Error("No checkpoints exist for this project");
  if (!isValidSha(sha)) throw new Error("Invalid sha");

  // Verify sha exists in this repo
  try {
    await runGit(botDir, ["cat-file", "-e", `${sha}^{commit}`]);
  } catch {
    throw new Error("Checkpoint not found");
  }

  // 1. Backup current state (forced — we want a marker even if clean)
  const backupSha = await snapshot(botDir, `Backup before restore`, {
    isAutomatic: true,
    skipIfClean: false,
  });

  // 2. Reset index + working tree to target sha (HEAD stays on main)
  await runGit(botDir, ["read-tree", "--reset", "-u", sha]);

  // 3. Commit the restored state so it's the new tip
  await runGit(botDir, ["add", "-A"]);
  const { stdout: shortIn } = await runGit(botDir, ["rev-parse", "--short", sha]);
  await runGit(botDir, [
    "commit",
    "-q",
    "--allow-empty",
    "-m", `[auto] Restored to ${shortIn.trim()}`,
  ]);
  const { stdout: head } = await runGit(botDir, ["rev-parse", "HEAD"]);

  return {
    backupSha,
    restoredFromSha: sha,
    newSha: head.trim(),
  };
}
