import { Router } from "express";
import { spawn } from "child_process";
import { getBot, getBotFilesDir } from "../lib/bot-manager.js";
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
  if (!getBot(id)) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const mgr = manager === "pip" ? "pip" : "npm";
  const args =
    mgr === "pip"
      ? ["install", name.trim()]
      : ["install", name.trim(), "--save"];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const proc = spawn(mgr, args, {
    cwd: getBotFilesDir(),
    env: process.env,
    shell: true,
  });

  const send = (type: string, text: string) => {
    res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
  };

  proc.stdout?.on("data", (d: Buffer) => send("stdout", d.toString()));
  proc.stderr?.on("data", (d: Buffer) => send("stderr", d.toString()));
  proc.on("error", (err) => send("error", err.message));
  proc.on("exit", (code) => {
    send("done", `Process exited with code ${code ?? 0}`);
    res.end();
  });

  req.on("close", () => {
    try { proc.kill(); } catch {}
  });
});

export default router;
