import { Router } from "express";
import { spawn } from "child_process";
import { join } from "path";
import { getBot, getBotDir } from "../lib/bot-manager.js";
import type { Response } from "express";

const router = Router();

// POST /bots/:id/packages/install  — SSE stream of npm/pip install output
router.post("/bots/:id/packages/install", (req, res: Response) => {
  const id = req.params.id;
  const { name, manager } = req.body as { name?: string; manager?: string };

  if (!name?.trim()) {
    res.status(400).json({ error: "Package name required" });
    return;
  }

  const bot = getBot(id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  // Determine package manager
  const isJs = bot.language === "javascript" || manager === "npm";
  const mgr = isJs ? "npm" : "pip3";

  // Build args — for pip3, install into bot's site-packages
  const botDir = getBotDir(id);
  const args = isJs
    ? ["install", name.trim(), "--save"]
    : ["install", name.trim(), "-t", join(botDir, "site-packages"), "--quiet"];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (type: string, text: string) => {
    res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
  };

  const proc = spawn(mgr, args, {
    cwd: botDir,
    env: {
      ...process.env,
      npm_config_prefix: botDir,
      PYTHONPATH: join(botDir, "site-packages"),
    },
    shell: false,
  });

  proc.stdout?.on("data", (d: Buffer) => send("stdout", d.toString()));
  proc.stderr?.on("data", (d: Buffer) => send("stderr", d.toString()));
  proc.on("error", (err) => send("error", `Failed to start ${mgr}: ${err.message}`));
  proc.on("exit", (code) => {
    send("done", `Process exited with code ${code ?? 0}`);
    res.end();
  });

  req.on("close", () => {
    try { proc.kill(); } catch {}
  });
});

export default router;
