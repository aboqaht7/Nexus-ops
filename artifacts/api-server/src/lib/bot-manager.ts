import { spawn, execFile, ChildProcess } from "child_process";
import { promisify } from "util";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
} from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import { readSecrets, writeSecrets } from "./secrets.js";

const execFileAsync = promisify(execFile);

const DATA_DIR = join(process.cwd(), "data");
const BOTS_FILE = join(DATA_DIR, "bots.json");
const BOT_FILES_DIR = join(DATA_DIR, "bot-files");
const BOT_ENVS_DIR = join(DATA_DIR, "bot-envs");
const MAX_LOG_ENTRIES = 1000;
const MAX_RESTART_DELAY_MS = 30_000;

export type BotStatus = "running" | "stopped" | "crashed" | "starting";
export type BotLanguage = "javascript" | "python";
export type ProjectType =
  | "discord-bot"
  | "website"
  | "game"
  | "web-app"
  | "api-server"
  | "python-script";

export const PROJECT_TYPES: ProjectType[] = [
  "discord-bot",
  "website",
  "game",
  "web-app",
  "api-server",
  "python-script",
];

/** Project types that produce static/web output viewable in an iframe */
export function isWebProject(type: ProjectType | undefined): boolean {
  return type === "website" || type === "game" || type === "web-app";
}

export interface BotRecord {
  id: string;
  name: string;
  filename: string;
  language: BotLanguage;
  status: BotStatus;
  autoRestart: boolean;
  restartCount: number;
  createdAt: string;
  startedAt: string | null;
  uptimeSeconds: number | null;
  userId?: string;
  projectType?: ProjectType;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

interface RuntimeState {
  process: ChildProcess | null;
  logs: LogEntry[];
  restartTimer: ReturnType<typeof setTimeout> | null;
  startedAt: Date | null;
}

const runtimeStates = new Map<string, RuntimeState>();

type LogSubscriber = (entry: LogEntry) => void;
const logSubscribers = new Map<string, Set<LogSubscriber>>();

function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BOT_FILES_DIR)) mkdirSync(BOT_FILES_DIR, { recursive: true });
  if (!existsSync(BOT_ENVS_DIR)) mkdirSync(BOT_ENVS_DIR, { recursive: true });
}

function loadBots(): BotRecord[] {
  ensureDirs();
  if (!existsSync(BOTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(BOTS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveBots(bots: BotRecord[]): void {
  ensureDirs();
  writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2), "utf-8");
}

function getRuntime(id: string): RuntimeState {
  let state = runtimeStates.get(id);
  if (!state) {
    state = { process: null, logs: [], restartTimer: null, startedAt: null };
    runtimeStates.set(id, state);
  }
  return state;
}

function addLog(id: string, level: "info" | "error", message: string) {
  const state = getRuntime(id);
  const entry: LogEntry = { timestamp: new Date().toISOString(), level, message };
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_ENTRIES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_ENTRIES);
  }
  const subs = logSubscribers.get(id);
  if (subs && subs.size > 0) {
    for (const cb of subs) {
      try { cb(entry); } catch { /* closed */ }
    }
  }
}

export function subscribeToLogs(id: string, cb: LogSubscriber): () => void {
  if (!logSubscribers.has(id)) logSubscribers.set(id, new Set());
  logSubscribers.get(id)!.add(cb);
  return () => logSubscribers.get(id)?.delete(cb);
}

/* ── Directory helpers ────────────────────────────────────────────────────── */

export function getBotDir(botId: string): string {
  const dir = join(BOT_FILES_DIR, botId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Returns the base bot-files dir (for multer uploads — we move files later) */
export function getBotFilesDir(): string {
  ensureDirs();
  return BOT_FILES_DIR;
}

/** Full path to the bot's main source file inside its isolated dir */
export function getBotFilePath(bot: BotRecord): string {
  return join(getBotDir(bot.id), bot.filename);
}

/** Migrate a bot from flat storage to isolated dir if needed */
function migrateBotIfNeeded(bot: BotRecord) {
  const isolated = join(BOT_FILES_DIR, bot.id, bot.filename);
  if (existsSync(isolated)) return; // already migrated

  const flat = join(BOT_FILES_DIR, bot.filename);
  if (existsSync(flat)) {
    const dir = getBotDir(bot.id);
    try {
      renameSync(flat, join(dir, bot.filename));
      logger.info({ botId: bot.id }, "Migrated bot file to isolated dir");
    } catch {
      // copy if rename fails across devices
      writeFileSync(join(dir, bot.filename), readFileSync(flat));
    }
  }

  // Create package.json for JS bots if missing
  if (bot.language === "javascript") {
    ensurePackageJson(bot);
  }
}

function ensurePackageJson(bot: BotRecord) {
  const dir = getBotDir(bot.id);
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    const pkg = {
      name: bot.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      version: "1.0.0",
      type: "commonjs",
      main: bot.filename,
      scripts: { start: `node ${bot.filename}` },
    };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
  }
}

function ensureRequirementsTxt(bot: BotRecord) {
  const dir = getBotDir(bot.id);
  const reqPath = join(dir, "requirements.txt");
  if (!existsSync(reqPath)) {
    writeFileSync(reqPath, "", "utf-8");
  }
}

/* ── List installed packages in a bot dir ────────────────────────────────── */

export function listInstalledPackages(botId: string, language: BotLanguage): string[] {
  const dir = join(BOT_FILES_DIR, botId);
  if (!existsSync(dir)) return [];

  if (language === "javascript") {
    const nmDir = join(dir, "node_modules");
    if (!existsSync(nmDir)) return [];
    try {
      return readdirSync(nmDir)
        .filter(n => !n.startsWith(".") && !n.startsWith("@"))
        .slice(0, 50);
    } catch { return []; }
  } else {
    // Python: read requirements.txt
    const req = join(dir, "requirements.txt");
    if (!existsSync(req)) return [];
    return readFileSync(req, "utf-8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  }
}

/* ── Data access ─────────────────────────────────────────────────────────── */

function enrichBot(b: BotRecord): BotRecord {
  const state = runtimeStates.get(b.id);
  let uptimeSeconds: number | null = null;
  let startedAt = b.startedAt;
  if (state?.startedAt && b.status === "running") {
    uptimeSeconds = Math.floor((Date.now() - state.startedAt.getTime()) / 1000);
    startedAt = state.startedAt.toISOString();
  }
  return { ...b, uptimeSeconds, startedAt };
}

export function listBots(userId?: string): BotRecord[] {
  const bots = loadBots();
  const filtered = userId
    ? bots.filter(b => b.userId === userId || !b.userId)
    : bots;
  return filtered.map(b => enrichBot(b));
}

export function getBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find(b => b.id === id);
  if (!bot) return undefined;
  return enrichBot(bot);
}

export function registerBot(
  name: string,
  filename: string,
  code: string,
  language: BotLanguage,
  userId?: string,
  projectType: ProjectType = "discord-bot",
): BotRecord {
  const bot: BotRecord = {
    id: randomUUID(),
    name,
    filename,
    language,
    status: "stopped",
    autoRestart: true,
    restartCount: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    uptimeSeconds: null,
    projectType,
    ...(userId ? { userId } : {}),
  };

  // Write file into isolated dir
  const dir = getBotDir(bot.id);
  writeFileSync(join(dir, filename), code, "utf-8");

  // Setup environment based on project type
  if (language === "javascript") {
    ensurePackageJson(bot);
  } else {
    ensureRequirementsTxt(bot);
  }

  // For static web projects, ensure an index.html so the iframe preview works
  if (isWebProject(projectType) && !filename.endsWith(".html")) {
    const indexPath = join(dir, "index.html");
    if (!existsSync(indexPath)) {
      writeFileSync(indexPath, code.trim().startsWith("<") ? code : defaultIndexHtml(name), "utf-8");
    }
  }

  const bots = loadBots();
  bots.push(bot);
  saveBots(bots);

  logger.info({ botId: bot.id, name, filename, projectType }, "Project registered");
  return bot;
}

function defaultIndexHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  <p>Empty project — ask Agent-4 to build it.</p>
</body>
</html>
`;
}

export function deleteBot(id: string): boolean {
  const bots = loadBots();
  const idx = bots.findIndex(b => b.id === id);
  if (idx === -1) return false;

  stopBotProcess(id, bots);
  bots.splice(idx, 1);
  saveBots(bots);
  runtimeStates.delete(id);
  logSubscribers.delete(id);
  logger.info({ botId: id }, "Bot deleted");
  return true;
}

function updateBotStatus(id: string, bots: BotRecord[], update: Partial<BotRecord>) {
  const idx = bots.findIndex(b => b.id === id);
  if (idx !== -1) {
    bots[idx] = { ...bots[idx], ...update };
    saveBots(bots);
  }
}

/* ── File content helpers ─────────────────────────────────────────────────── */

export function getBotFileContent(id: string): string | undefined {
  const bot = getBot(id);
  if (!bot) return undefined;
  migrateBotIfNeeded(bot);
  const filePath = getBotFilePath(bot);
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8");
}

export function setBotFileContent(id: string, content: string): boolean {
  const bot = getBot(id);
  if (!bot) return false;
  migrateBotIfNeeded(bot);
  writeFileSync(getBotFilePath(bot), content, "utf-8");
  addLog(id, "info", "File saved");
  return true;
}

/* ── Env var helpers (encrypted at rest via secrets.ts) ───────────────────── */

export function getBotEnv(id: string): Record<string, string> {
  return readSecrets(id);
}

export function setBotEnv(id: string, vars: Record<string, string>): void {
  ensureDirs();
  writeSecrets(id, vars);
}

/* ── Package installation ─────────────────────────────────────────────────── */

export async function installPackages(
  botId: string,
  packages: string[],
): Promise<{ success: boolean; output: string }> {
  const bot = getBot(botId);
  if (!bot) return { success: false, output: "Bot not found" };
  migrateBotIfNeeded(bot);

  const dir = getBotDir(botId);
  const pkgs = packages.map(p => p.trim()).filter(Boolean);
  if (pkgs.length === 0) return { success: true, output: "No packages specified" };

  const isJs = bot.language === "javascript";
  const cmd = isJs ? "npm" : "pip3";
  const args = isJs
    ? ["install", "--save", ...pkgs]
    : ["install", ...pkgs, "-t", join(dir, "site-packages"), "--quiet"];

  addLog(botId, "info", `Installing: ${pkgs.join(", ")}`);

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: dir,
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
      env: {
        ...process.env,
        npm_config_prefix: dir,
        PYTHONPATH: join(dir, "site-packages"),
      },
    });

    // For Python, save to requirements.txt
    if (!isJs) {
      const reqPath = join(dir, "requirements.txt");
      const existing = existsSync(reqPath)
        ? readFileSync(reqPath, "utf-8").split("\n").filter(Boolean)
        : [];
      const merged = [...new Set([...existing, ...pkgs])];
      writeFileSync(reqPath, merged.join("\n") + "\n", "utf-8");
    }

    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    addLog(botId, "info", `Install complete: ${pkgs.join(", ")}`);
    return { success: true, output: out || "Installation successful" };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    addLog(botId, "error", `Install failed: ${out || e.message}`);
    return { success: false, output: out || e.message || "Installation failed" };
  }
}

/* ── Process management ─────────────────────────────────────────────────── */

function spawnBotProcess(bot: BotRecord, bots: BotRecord[]) {
  migrateBotIfNeeded(bot);
  const state = getRuntime(bot.id);

  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }

  const botDir = getBotDir(bot.id);
  const botEnv = getBotEnv(bot.id);

  const isJs = bot.language === "javascript";
  const cmd = isJs ? "node" : "python3";
  const args = [bot.filename];

  addLog(bot.id, "info", `▶ Starting: ${cmd} ${bot.filename}`);

  const proc = spawn(cmd, args, {
    cwd: botDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...botEnv,
      NODE_PATH: join(botDir, "node_modules"),
      PYTHONPATH: join(botDir, "site-packages"),
      PYTHONUNBUFFERED: "1",
    },
  });

  state.process = proc;
  state.startedAt = new Date();
  updateBotStatus(bot.id, bots, { status: "running", startedAt: state.startedAt.toISOString() });

  proc.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(l => l.trim());
    for (const line of lines) addLog(bot.id, "info", line);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(l => l.trim());
    for (const line of lines) addLog(bot.id, "error", line);
  });

  proc.on("exit", (code, signal) => {
    const freshBots = loadBots();
    const current = freshBots.find(b => b.id === bot.id);
    if (!current) return;

    state.process = null;
    state.startedAt = null;

    const crashed = code !== 0 && signal !== "SIGTERM";
    addLog(bot.id, crashed ? "error" : "info", `■ Exited (code=${code}, signal=${signal})`);

    if (current.autoRestart && crashed) {
      const delay = Math.min(3000 * (current.restartCount + 1), MAX_RESTART_DELAY_MS);
      addLog(bot.id, "info", `⟳ Auto-restart in ${delay / 1000}s (attempt ${current.restartCount + 1})`);
      updateBotStatus(bot.id, freshBots, { status: "crashed", restartCount: current.restartCount + 1 });
      state.restartTimer = setTimeout(() => {
        const latestBots = loadBots();
        const latestBot = latestBots.find(b => b.id === bot.id);
        if (latestBot?.autoRestart) spawnBotProcess(latestBot, latestBots);
      }, delay);
    } else {
      updateBotStatus(bot.id, freshBots, { status: "stopped" });
    }
  });

  logger.info({ botId: bot.id, pid: proc.pid, cwd: botDir }, "Bot process started");
}

function stopBotProcess(id: string, bots: BotRecord[]) {
  const state = getRuntime(id);
  if (state.restartTimer) { clearTimeout(state.restartTimer); state.restartTimer = null; }
  if (state.process) { state.process.kill("SIGTERM"); state.process = null; }
  state.startedAt = null;
  updateBotStatus(id, bots, { status: "stopped", autoRestart: false });
}

export function startBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find(b => b.id === id);
  if (!bot) return undefined;
  const state = getRuntime(id);
  if (state.process) return enrichBot(bot);
  updateBotStatus(id, bots, { autoRestart: true, status: "starting" });
  const fresh = loadBots();
  spawnBotProcess(fresh.find(b => b.id === id)!, fresh);
  return getBot(id);
}

export function stopBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find(b => b.id === id);
  if (!bot) return undefined;
  stopBotProcess(id, bots);
  addLog(id, "info", "■ Manually stopped");
  return getBot(id);
}

export function restartBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find(b => b.id === id);
  if (!bot) return undefined;
  const state = getRuntime(id);
  if (state.process) { state.process.kill("SIGTERM"); state.process = null; }
  if (state.restartTimer) { clearTimeout(state.restartTimer); state.restartTimer = null; }
  state.startedAt = null;
  updateBotStatus(id, bots, { autoRestart: true, status: "starting" });
  const fresh = loadBots();
  addLog(id, "info", "⟳ Restarting...");
  spawnBotProcess(fresh.find(b => b.id === id)!, fresh);
  return getBot(id);
}

export function getBotLogs(id: string): LogEntry[] | undefined {
  const bots = loadBots();
  if (!bots.find(b => b.id === id)) return undefined;
  return [...getRuntime(id).logs];
}

export function getStats() {
  const bots = listBots();
  return {
    total: bots.length,
    running: bots.filter(b => b.status === "running").length,
    stopped: bots.filter(b => b.status === "stopped").length,
    crashed: bots.filter(b => b.status === "crashed").length,
    totalRestarts: bots.reduce((acc, b) => acc + b.restartCount, 0),
  };
}

export function resumeAllBots() {
  const bots = loadBots();
  let resumed = 0;
  for (const bot of bots) {
    if (bot.autoRestart && (bot.status === "running" || bot.status === "crashed")) {
      const state = getRuntime(bot.id);
      if (!state.process) {
        addLog(bot.id, "info", "Resuming after server restart");
        spawnBotProcess(bot, bots);
        resumed++;
      }
    }
  }
  if (resumed > 0) logger.info({ resumed }, "Resumed bots after restart");
}
