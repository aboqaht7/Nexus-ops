import { execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync } from "fs";
import { join, resolve, sep, dirname, relative } from "path";
import { request as httpsRequest } from "https";
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

/* ── Path safety ────────────────────────────────────────────────────────── */

const MAX_FILE_BYTES = 256 * 1024; // 256KB read/write limit
const MAX_LIST_ENTRIES = 500;
const IGNORE_DIRS = new Set(["node_modules", ".venv", "venv", "__pycache__", ".git", "dist", "build", ".next"]);

/**
 * Resolve a user-supplied relative path inside the bot's directory.
 * Rejects absolute paths, `..` escapes, and anything resolving outside the bot dir.
 */
function safeResolve(botId: string, relPath: string): { ok: true; abs: string; root: string } | { ok: false; error: string } {
  if (typeof relPath !== "string") return { ok: false, error: "path must be a string" };
  const trimmed = relPath.trim().replace(/^\/+/, ""); // strip leading slashes
  if (trimmed.includes("\0")) return { ok: false, error: "invalid path" };

  const root = resolve(getBotDir(botId));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  const abs = resolve(join(root, trimmed));
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    return { ok: false, error: "Path escapes the project directory" };
  }
  return { ok: true, abs, root };
}

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
  {
    name: "list_files",
    description: "List files and folders inside the project (recursive). Skips node_modules/.venv/.git. Use this to understand the project structure before editing.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Subdirectory inside the project, relative. Empty or '.' lists the project root.",
        },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description: "Read any file inside the project by its relative path. Use this for files other than the main bot file (e.g. index.html, styles.css, package.json, additional source files).",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path inside the project (e.g. 'index.html', 'src/utils.js')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite ANY file inside the project at the given relative path. Creates parent directories as needed. Use this to build multi-file projects (HTML+CSS+JS, multi-route APIs, multi-module Python).",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path (e.g. 'styles.css', 'src/components/Header.jsx')",
        },
        content: {
          type: "string",
          description: "Full file contents to write.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "web_search",
    description: "Search the public web for documentation, code examples, library APIs, error messages, or best practices. Returns up to 5 results (title + URL + snippet). Use this BEFORE writing code that involves a library or API you're not 100% sure about.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Concise search query, e.g. 'three.js OrbitControls touch events' or 'react-router v6 redirect'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file or empty directory inside the project. Use sparingly.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path inside the project to delete.",
        },
      },
      required: ["path"],
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

    case "list_files": {
      const sub = typeof input["path"] === "string" ? input["path"] : "";
      const r = safeResolve(botId, sub);
      if (!r.ok) return `Error: ${r.error}`;
      if (!existsSync(r.abs)) return `Error: path does not exist: ${sub || "."}`;
      const stat = statSync(r.abs);
      if (!stat.isDirectory()) return `Error: not a directory: ${sub}`;

      const out: string[] = [];
      const walk = (dir: string, depth: number) => {
        if (out.length >= MAX_LIST_ENTRIES || depth > 6) return;
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const name of entries.sort()) {
          if (out.length >= MAX_LIST_ENTRIES) { out.push("... (truncated)"); return; }
          if (IGNORE_DIRS.has(name)) continue;
          const full = join(dir, name);
          let s; try { s = statSync(full); } catch { continue; }
          const rel = relative(r.root, full).split(sep).join("/");
          if (s.isDirectory()) {
            out.push(`${rel}/`);
            walk(full, depth + 1);
          } else {
            out.push(`${rel}  (${s.size} bytes)`);
          }
        }
      };
      walk(r.abs, 0);
      return out.length === 0 ? "(empty directory)" : out.join("\n");
    }

    case "read_file": {
      const p = input["path"];
      if (typeof p !== "string" || !p.trim()) return "Error: path is required";
      const r = safeResolve(botId, p);
      if (!r.ok) return `Error: ${r.error}`;
      if (!existsSync(r.abs)) return `Error: file does not exist: ${p}`;
      const stat = statSync(r.abs);
      if (stat.isDirectory()) return `Error: ${p} is a directory — use list_files instead.`;
      if (stat.size > MAX_FILE_BYTES) return `Error: file too large (${stat.size} bytes, max ${MAX_FILE_BYTES})`;
      try {
        return readFileSync(r.abs, "utf-8");
      } catch (e) {
        return `Error reading file: ${(e as Error).message}`;
      }
    }

    case "write_file": {
      const p = input["path"];
      const content = input["content"];
      if (typeof p !== "string" || !p.trim()) return "Error: path is required";
      if (typeof content !== "string") return "Error: content must be a string";
      if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
        return `Error: content too large (max ${MAX_FILE_BYTES} bytes)`;
      }
      const r = safeResolve(botId, p);
      if (!r.ok) return `Error: ${r.error}`;
      try {
        const parent = dirname(r.abs);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        writeFileSync(r.abs, content, "utf-8");
        const lines = content.split("\n").length;
        return `✓ Wrote ${p} (${lines} lines, ${Buffer.byteLength(content, "utf-8")} bytes)`;
      } catch (e) {
        return `Error writing file: ${(e as Error).message}`;
      }
    }

    case "web_search": {
      const q = input["query"];
      if (typeof q !== "string" || !q.trim()) return "Error: query is required";
      try {
        const results = await webSearch(q.trim());
        if (results.length === 0) return "(no results)";
        return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
      } catch (e) {
        return `Error: web search failed: ${(e as Error).message}`;
      }
    }

    case "delete_file": {
      const p = input["path"];
      if (typeof p !== "string" || !p.trim()) return "Error: path is required";
      const r = safeResolve(botId, p);
      if (!r.ok) return `Error: ${r.error}`;
      if (r.abs === r.root) return "Error: cannot delete project root";
      if (!existsSync(r.abs)) return `Error: ${p} does not exist`;
      try {
        rmSync(r.abs, { recursive: false, force: false });
        return `✓ Deleted ${p}`;
      } catch (e) {
        return `Error deleting: ${(e as Error).message}`;
      }
    }

    default:
      return "Unknown tool.";
  }
}

/* ── Web search (DuckDuckGo HTML, no API key) ──────────────────────────── */

interface SearchResult { title: string; url: string; snippet: string }

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
}
function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

const FETCH_MAX_BYTES = 2 * 1024 * 1024; // cap web-search HTML response at 2MB to avoid OOM

async function fetchHtml(url: string): Promise<string> {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NexusOpsAgent/1.0)",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: 8000,
      },
      (r) => {
        let total = 0;
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => {
          total += c.length;
          if (total > FETCH_MAX_BYTES) {
            r.destroy(new Error("response too large"));
            return;
          }
          chunks.push(c);
        });
        r.on("end", () => res(Buffer.concat(chunks).toString("utf-8")));
        r.on("error", rej);
      },
    );
    req.on("error", rej);
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.end();
  });
}

// Reject URLs that resolve to private / local / metadata addresses.
// We can't do real DNS resolution synchronously, so we reject obvious literals + RFC1918 / link-local hostnames.
function isUnsafeHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? "";
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 literal checks
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. AWS metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
  }
  // IPv6 literal: bracketed in URL host, but raw could appear
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;
  return false;
}

function isSafeResultUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (isUnsafeHost(u.hostname)) return false;
  return true;
}

async function webSearch(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const results: SearchResult[] = [];
  // DuckDuckGo HTML wraps each result in <div class="result"> with a result__a link and result__snippet text.
  // Anchored character classes ([^<]*?, [^>]+) keep the regex linear and avoid catastrophic backtracking.
  const blockRe = /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]{1,400})<\/a>[\s\S]{0,2000}?<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]{0,1500}?)<\/a>/g;
  let m: RegExpExecArray | null;
  let iters = 0;
  while ((m = blockRe.exec(html)) && results.length < 5 && iters++ < 50) {
    let href = decodeHtml(m[1] ?? "");
    // Unwrap DuckDuckGo redirect: //duckduckgo.com/l/?uddg=ENCODED
    const ddg = href.match(/[?&]uddg=([^&]+)/);
    if (ddg && ddg[1]) {
      try { href = decodeURIComponent(ddg[1]); } catch { /* keep as-is */ }
    }
    if (href.startsWith("//")) href = "https:" + href;
    if (!isSafeResultUrl(href)) continue;
    const title = stripTags(m[2] ?? "");
    const snippet = stripTags(m[3] ?? "");
    if (title) results.push({ title, url: href, snippet });
  }
  return results;
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
