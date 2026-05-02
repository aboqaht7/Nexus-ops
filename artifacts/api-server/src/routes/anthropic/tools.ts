import { execFile } from "child_process";
import { promisify } from "util";
import {
  getBotFileContent,
  setBotFileContent,
  getBotLogs,
  restartBot,
  startBot,
  stopBot,
  getBot,
  getBotDir,
  installPackages,
} from "../../lib/bot-manager.js";
import { logger } from "../../lib/logger.js";

const execFileAsync = promisify(execFile);

/* ── Tool definitions for Claude ────────────────────────────────────────── */

export const AGENT_TOOLS = [
  {
    name: "read_bot_file",
    description: "Read the complete source code of the bot file. Always call this before making any changes.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "write_bot_file",
    description: "Write/overwrite the entire bot source code. Saves immediately. Call restart_bot after to apply changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The complete new source code for the bot",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "install_packages",
    description: "Install one or more npm packages (for JavaScript bots) or pip packages (for Python bots) into the bot's isolated environment. Use this before running code that requires external libraries.",
    input_schema: {
      type: "object" as const,
      properties: {
        packages: {
          type: "array",
          items: { type: "string" },
          description: "Package names to install. Example: ['discord.js', 'axios'] or ['discord.py', 'requests']",
        },
      },
      required: ["packages"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the bot's isolated working directory. Use for checking installed packages, testing imports, or running diagnostics. npm install / pip install commands are available but prefer install_packages for that.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "Shell command to run. Runs inside the bot's own directory.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "get_bot_logs",
    description: "Get the most recent log output from the running bot. Use to check for errors, confirm startup, or diagnose crashes.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "number",
          description: "Number of recent log lines to return (default 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "restart_bot",
    description: "Restart the bot to apply code or package changes. Always call after write_bot_file or install_packages.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "stop_bot",
    description: "Stop the running bot process.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "start_bot",
    description: "Start the bot process.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
] as const;

export type ToolName = typeof AGENT_TOOLS[number]["name"];

/* ── Tool execution ─────────────────────────────────────────────────────── */

export async function executeTool(
  name: ToolName,
  input: Record<string, unknown>,
  botId: string,
): Promise<string> {
  logger.info({ name, botId }, "Executing agent tool");

  switch (name) {
    case "read_bot_file": {
      const content = getBotFileContent(botId);
      if (content === undefined) return "Error: Bot not found.";
      if (!content.trim()) return "(empty file — bot has no code yet)";
      return content;
    }

    case "write_bot_file": {
      const code = input["code"];
      if (typeof code !== "string") return "Error: code must be a string.";
      const ok = setBotFileContent(botId, code);
      if (!ok) return "Error: Bot not found.";
      return `✓ File written (${code.split("\n").length} lines). Call restart_bot to apply.`;
    }

    case "install_packages": {
      const pkgsRaw = input["packages"];
      if (!Array.isArray(pkgsRaw) || pkgsRaw.length === 0) {
        return "Error: packages must be a non-empty array.";
      }
      const packages = pkgsRaw.map(String).filter(Boolean);
      const result = await installPackages(botId, packages);
      return result.success
        ? `✓ Installed: ${packages.join(", ")}\n${result.output}`
        : `✗ Installation failed:\n${result.output}`;
    }

    case "run_command": {
      const command = input["command"];
      if (typeof command !== "string") return "Error: command must be a string.";

      const blocked = ["rm -rf /", "sudo rm -rf", "mkfs", "dd if=", "> /dev/sd", "shutdown", "reboot", ":(){:|:&};:"];
      if (blocked.some(b => command.includes(b))) {
        return "Error: This command is blocked for security reasons.";
      }

      const bot = getBot(botId);
      if (!bot) return "Error: Bot not found.";

      const cwd = getBotDir(botId);

      try {
        const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
          cwd,
          timeout: 60_000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return out || "(command completed with no output)";
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
        return out || e.message || "Command failed";
      }
    }

    case "get_bot_logs": {
      const lines = typeof input["lines"] === "number" ? input["lines"] : 50;
      const logs = getBotLogs(botId);
      if (!logs) return "Error: Bot not found.";
      if (logs.length === 0) return "(no logs yet — bot may not have started)";
      const recent = logs.slice(-lines);
      return recent
        .map(l => `[${new Date(l.timestamp).toLocaleTimeString("ar-SA")}] ${l.level === "error" ? "✗" : "·"} ${l.message}`)
        .join("\n");
    }

    case "restart_bot": {
      const bot = restartBot(botId);
      if (!bot) return "Error: Bot not found.";
      return `⟳ Restarting "${bot.name}"... Check get_bot_logs in a few seconds to confirm startup.`;
    }

    case "stop_bot": {
      const bot = stopBot(botId);
      if (!bot) return "Error: Bot not found.";
      return `■ Bot "${bot.name}" stopped.`;
    }

    case "start_bot": {
      const bot = startBot(botId);
      if (!bot) return "Error: Bot not found.";
      return `▶ Starting "${bot.name}"... Check get_bot_logs to confirm.`;
    }

    default:
      return "Unknown tool.";
  }
}

/* ── Bot context for system prompt ─────────────────────────────────────── */

const MAX_INLINE_FILE_CHARS = 6000;

// Strip characters that could break out of the system-prompt structure
// (markdown fences, XML tags, control chars). Keeps the agent's view honest.
function sanitizeForPrompt(s: string): string {
  return s.replace(/```/g, "ʼʼʼ").replace(/[\u0000-\u0008\u000b-\u001f]/g, "");
}

export function buildBotContext(botId: string | null): string {
  if (!botId) return "";
  const bot = getBot(botId);
  if (!bot) return "";

  const projectType = bot.projectType ?? "discord-bot";
  const safeBotName = sanitizeForPrompt(bot.name).slice(0, 120);
  const safeFilename = sanitizeForPrompt(bot.filename).slice(0, 120);

  const raw = getBotFileContent(botId);
  let fileSection = "";
  if (raw !== undefined) {
    const truncated = raw.length > MAX_INLINE_FILE_CHARS;
    const slice = truncated ? raw.slice(0, MAX_INLINE_FILE_CHARS) : raw;
    const safeContent = sanitizeForPrompt(slice);
    fileSection =
      `\n\nCurrent contents of \`${safeFilename}\`` +
      (truncated ? ` (first ${MAX_INLINE_FILE_CHARS} chars; call read_bot_file for the full file):` : ":") +
      `\n<file>\n${safeContent}\n</file>`;
  }

  return `\n\n---
You are working on the project: "${safeBotName}".
- Type: ${projectType}
- Language: ${bot.language}
- Status: ${bot.status}
- Main file: ${safeFilename}
- Isolated directory with its own node_modules/site-packages
The current main-file contents are inlined below — treat them as the source of truth and only call read_bot_file if you need to verify changes you just wrote.
Workflow: write_bot_file → install_packages (if needed) → restart_bot → get_bot_logs.${fileSection}
---`;
}
