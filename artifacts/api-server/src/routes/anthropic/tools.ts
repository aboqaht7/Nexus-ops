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
  getBotFilesDir,
} from "../../lib/bot-manager.js";
import { logger } from "../../lib/logger.js";

const execFileAsync = promisify(execFile);

/* ── Tool definitions for Claude ────────────────────────────────────────── */

export const AGENT_TOOLS = [
  {
    name: "read_bot_file",
    description: "Read the current complete source code of the bot file. Use this first before making any changes.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "write_bot_file",
    description: "Write/overwrite the entire bot source code with new content. This saves the file immediately. After writing, use restart_bot to apply changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The complete new source code for the bot file",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the bot's working directory. Use for installing packages (pip install X, npm install X), checking versions, or running quick diagnostics. Output is captured and returned.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "Shell command to run. Example: 'pip install discord.py' or 'npm install discord.js'",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "get_bot_logs",
    description: "Fetch the most recent log entries from the running bot. Use this to check for errors, see output, or diagnose issues.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "number",
          description: "Number of recent log lines to fetch (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "restart_bot",
    description: "Restart the bot to apply code changes. Always call this after writing code changes.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "stop_bot",
    description: "Stop the running bot.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "start_bot",
    description: "Start the bot.",
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
      if (content === null) return "Error: Bot not found or file does not exist.";
      if (!content.trim()) return "(empty file)";
      return content;
    }

    case "write_bot_file": {
      const code = input["code"];
      if (typeof code !== "string") return "Error: code must be a string.";
      const ok = setBotFileContent(botId, code);
      if (!ok) return "Error: Bot not found.";
      return `File written successfully (${code.length} characters).`;
    }

    case "run_command": {
      const command = input["command"];
      if (typeof command !== "string") return "Error: command must be a string.";

      // Safety: limit dangerous commands
      const blocked = ["rm -rf", "sudo rm", "mkfs", "dd if=", "> /dev/", "shutdown", "reboot"];
      if (blocked.some(b => command.includes(b))) {
        return "Error: This command is not allowed for security reasons.";
      }

      try {
        const cwd = getBotFilesDir();
        const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
          cwd,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
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
      const lines = typeof input["lines"] === "number" ? input["lines"] : 30;
      const logs = getBotLogs(botId);
      if (!logs) return "Error: Bot not found.";
      if (logs.length === 0) return "(no logs yet)";
      const recent = logs.slice(-lines);
      return recent
        .map(l => `[${l.timestamp}] ${l.level.toUpperCase()}: ${l.message}`)
        .join("\n");
    }

    case "restart_bot": {
      const bot = restartBot(botId);
      if (!bot) return "Error: Bot not found.";
      return `Bot "${bot.name}" is restarting. Status: ${bot.status}`;
    }

    case "stop_bot": {
      const bot = stopBot(botId);
      if (!bot) return "Error: Bot not found.";
      return `Bot "${bot.name}" stopped.`;
    }

    case "start_bot": {
      const bot = startBot(botId);
      if (!bot) return "Error: Bot not found.";
      return `Bot "${bot.name}" is starting. Status: ${bot.status}`;
    }

    default:
      return "Unknown tool.";
  }
}

/* ── Bot context for system prompt ─────────────────────────────────────── */

export function buildBotContext(botId: string | null): string {
  if (!botId) return "";
  const bot = getBot(botId);
  if (!bot) return "";
  return `\n\n---
You are working on a bot named "${bot.name}" (${bot.language}, status: ${bot.status}).
The bot file is "${bot.filename}". Use the read_bot_file tool to read its code before making changes.
Always use write_bot_file to save changes and restart_bot to apply them.
---`;
}
