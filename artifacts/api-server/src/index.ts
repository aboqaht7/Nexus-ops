import { createServer } from "http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { resumeAllBots, getBotDir, getBot } from "./lib/bot-manager.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const httpServer = createServer(app);

// ── WebSocket Terminal ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
  const match = req.url?.match(/^\/api\/bots\/([^/]+)\/terminal/);
  if (!match) {
    socket.destroy();
    return;
  }
  const botId = match[1];
  wss.handleUpgrade(req, socket, head, (ws) => {
    handleTerminalSession(ws, botId);
  });
});

function handleTerminalSession(ws: WebSocket, botId: string) {
  const bot = getBot(botId);
  if (!bot) {
    ws.close(1008, "Bot not found");
    return;
  }

  let ptyProcess: import("node-pty").IPty | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pty = require("node-pty") as typeof import("node-pty");
    const cwd = getBotDir(botId);

    ptyProcess = pty.spawn("bash", [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env as Record<string, string>, PS1: `\\[\\033[1;33m\\]${bot.name}\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ ` },
    });

    ptyProcess.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    ptyProcess.onExit(() => {
      if (ws.readyState === ws.OPEN) ws.close(1000, "Shell exited");
    });

    // Welcome message
    setTimeout(() => {
      ptyProcess?.write(`echo -e "\\033[1;32mNexusOps Terminal — ${bot.name}\\033[0m" && ls -la\r`);
    }, 200);
  } catch (err) {
    logger.error({ err, botId }, "Failed to spawn PTY");
    ws.send(`\x1b[31mTerminal unavailable: ${(err as Error).message}\x1b[0m\r\n`);
    ws.close(1011, "Terminal spawn failed");
    return;
  }

  ws.on("message", (raw) => {
    if (!ptyProcess) return;
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input") {
        ptyProcess.write(msg.data);
      } else if (msg.type === "resize" && msg.cols && msg.rows) {
        ptyProcess.resize(Number(msg.cols), Number(msg.rows));
      }
    } catch {
      // treat as raw input if not JSON
      ptyProcess.write(raw.toString());
    }
  });

  ws.on("close", () => {
    try { ptyProcess?.kill(); } catch {}
    ptyProcess = null;
  });
}

// ── Start server ──────────────────────────────────────────────────────────────
httpServer.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  resumeAllBots();
});
