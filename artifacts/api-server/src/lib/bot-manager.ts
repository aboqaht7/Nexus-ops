import { spawn, ChildProcess } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { logger } from "./logger";

const DATA_DIR = join(process.cwd(), "data");
const BOTS_FILE = join(DATA_DIR, "bots.json");
const BOT_FILES_DIR = join(DATA_DIR, "bot-files");
const MAX_LOG_ENTRIES = 200;
const MAX_RESTART_DELAY_MS = 30_000;

export type BotStatus = "running" | "stopped" | "crashed" | "starting";
export type BotLanguage = "javascript" | "python";

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

function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BOT_FILES_DIR)) mkdirSync(BOT_FILES_DIR, { recursive: true });
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
  state.logs.push({ timestamp: new Date().toISOString(), level, message });
  if (state.logs.length > MAX_LOG_ENTRIES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_ENTRIES);
  }
}

export function getBotFilesDir(): string {
  ensureDirs();
  return BOT_FILES_DIR;
}

export function listBots(): BotRecord[] {
  const bots = loadBots();
  return bots.map((b) => enrichBot(b));
}

function enrichBot(b: BotRecord): BotRecord {
  const state = runtimeStates.get(b.id);
  let uptimeSeconds: number | null = null;
  let startedAt = b.startedAt;

  if (state?.startedAt && b.status === "running") {
    uptimeSeconds = Math.floor(
      (Date.now() - state.startedAt.getTime()) / 1000
    );
    startedAt = state.startedAt.toISOString();
  }

  return { ...b, uptimeSeconds, startedAt };
}

export function getBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find((b) => b.id === id);
  if (!bot) return undefined;
  return enrichBot(bot);
}

export function registerBot(
  name: string,
  filename: string
): BotRecord {
  const ext = extname(filename).toLowerCase();
  const language: BotLanguage =
    ext === ".py" ? "python" : "javascript";

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
  };

  const bots = loadBots();
  bots.push(bot);
  saveBots(bots);

  logger.info({ botId: bot.id, name, filename }, "Bot registered");
  return bot;
}

export function deleteBot(id: string): boolean {
  const bots = loadBots();
  const idx = bots.findIndex((b) => b.id === id);
  if (idx === -1) return false;

  const bot = bots[idx];
  stopBotProcess(id, bots);

  bots.splice(idx, 1);
  saveBots(bots);

  runtimeStates.delete(id);
  logger.info({ botId: id }, "Bot deleted");
  return true;
}

function updateBotStatus(
  id: string,
  bots: BotRecord[],
  update: Partial<BotRecord>
) {
  const idx = bots.findIndex((b) => b.id === id);
  if (idx !== -1) {
    bots[idx] = { ...bots[idx], ...update };
    saveBots(bots);
  }
}

function getBotFilePath(filename: string): string {
  return join(BOT_FILES_DIR, filename);
}

function spawnBotProcess(bot: BotRecord, bots: BotRecord[]) {
  const state = getRuntime(bot.id);

  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }

  const filePath = getBotFilePath(bot.filename);
  const cmd = bot.language === "python" ? "python3" : "node";
  const args = [filePath];

  addLog(bot.id, "info", `Starting bot (cmd: ${cmd} ${filePath})`);

  const proc = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  state.process = proc;
  state.startedAt = new Date();

  updateBotStatus(bot.id, bots, { status: "running", startedAt: state.startedAt.toISOString() });

  proc.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      addLog(bot.id, "info", line);
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      addLog(bot.id, "error", line);
    }
  });

  proc.on("exit", (code, signal) => {
    const freshBots = loadBots();
    const current = freshBots.find((b) => b.id === bot.id);
    if (!current) return;

    state.process = null;
    state.startedAt = null;

    const crashed = code !== 0 && signal !== "SIGTERM";
    addLog(
      bot.id,
      crashed ? "error" : "info",
      `Bot exited (code=${code}, signal=${signal})`
    );

    if (current.autoRestart && crashed) {
      const delay = Math.min(3000 * (current.restartCount + 1), MAX_RESTART_DELAY_MS);
      addLog(bot.id, "info", `Auto-restarting in ${delay / 1000}s (attempt ${current.restartCount + 1})`);
      updateBotStatus(bot.id, freshBots, {
        status: "crashed",
        restartCount: current.restartCount + 1,
      });
      state.restartTimer = setTimeout(() => {
        const latestBots = loadBots();
        const latestBot = latestBots.find((b) => b.id === bot.id);
        if (latestBot && latestBot.autoRestart) {
          spawnBotProcess(latestBot, latestBots);
        }
      }, delay);
    } else {
      updateBotStatus(bot.id, freshBots, { status: "stopped" });
    }
  });

  logger.info({ botId: bot.id, pid: proc.pid }, "Bot process started");
}

function stopBotProcess(id: string, bots: BotRecord[]) {
  const state = getRuntime(id);
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }
  if (state.process) {
    state.process.kill("SIGTERM");
    state.process = null;
  }
  state.startedAt = null;
  updateBotStatus(id, bots, { status: "stopped", autoRestart: false });
}

export function startBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find((b) => b.id === id);
  if (!bot) return undefined;

  const state = getRuntime(id);
  if (state.process) {
    return enrichBot(bot);
  }

  updateBotStatus(id, bots, { autoRestart: true, status: "starting" });
  const updatedBots = loadBots();
  const updatedBot = updatedBots.find((b) => b.id === id)!;
  spawnBotProcess(updatedBot, updatedBots);

  return getBot(id);
}

export function stopBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find((b) => b.id === id);
  if (!bot) return undefined;

  stopBotProcess(id, bots);
  addLog(id, "info", "Bot manually stopped");
  return getBot(id);
}

export function restartBot(id: string): BotRecord | undefined {
  const bots = loadBots();
  const bot = bots.find((b) => b.id === id);
  if (!bot) return undefined;

  const state = getRuntime(id);
  if (state.process) {
    state.process.kill("SIGTERM");
    state.process = null;
  }
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }
  state.startedAt = null;

  updateBotStatus(id, bots, { autoRestart: true, status: "starting" });
  const freshBots = loadBots();
  const freshBot = freshBots.find((b) => b.id === id)!;
  addLog(id, "info", "Bot manually restarted");
  spawnBotProcess(freshBot, freshBots);

  return getBot(id);
}

export function getBotLogs(id: string): LogEntry[] | undefined {
  const bots = loadBots();
  if (!bots.find((b) => b.id === id)) return undefined;
  const state = getRuntime(id);
  return [...state.logs];
}

export function getStats() {
  const bots = listBots();
  return {
    total: bots.length,
    running: bots.filter((b) => b.status === "running").length,
    stopped: bots.filter((b) => b.status === "stopped").length,
    crashed: bots.filter((b) => b.status === "crashed").length,
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
        addLog(bot.id, "info", "Resuming bot after server restart");
        spawnBotProcess(bot, bots);
        resumed++;
      }
    }
  }
  if (resumed > 0) {
    logger.info({ resumed }, "Resumed bots after server restart");
  }
}
