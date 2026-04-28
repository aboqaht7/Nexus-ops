import { Router } from "express";
import {
  GetBotFileParams,
  SaveBotFileParams,
  SaveBotFileBody,
  GetBotEnvParams,
  SetBotEnvParams,
  SetBotEnvBody,
} from "@workspace/api-zod";
import {
  getBot,
  getBotFileContent,
  setBotFileContent,
  getBotEnv,
  setBotEnv,
  getBotLogs,
  subscribeToLogs,
} from "../lib/bot-manager.js";
import type { Response } from "express";

const router = Router();

// GET /bots/:id/file
router.get("/bots/:id/file", (req, res) => {
  const { id } = GetBotFileParams.parse(req.params);
  if (!getBot(id)) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  const content = getBotFileContent(id) ?? "";
  res.json({ content });
});

// PUT /bots/:id/file
router.put("/bots/:id/file", (req, res) => {
  const { id } = SaveBotFileParams.parse(req.params);
  const { content } = SaveBotFileBody.parse(req.body);
  if (!setBotFileContent(id, content)) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json({ saved: true });
});

// GET /bots/:id/env
router.get("/bots/:id/env", (req, res) => {
  const { id } = GetBotEnvParams.parse(req.params);
  if (!getBot(id)) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  const envObj = getBotEnv(id);
  const vars = Object.entries(envObj).map(([key, value]) => ({ key, value }));
  res.json({ vars });
});

// PUT /bots/:id/env
router.put("/bots/:id/env", (req, res) => {
  const { id } = SetBotEnvParams.parse(req.params);
  const { vars } = SetBotEnvBody.parse(req.body);
  if (!getBot(id)) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  const envObj: Record<string, string> = {};
  for (const { key, value } of vars) {
    if (key.trim()) envObj[key.trim()] = value;
  }
  setBotEnv(id, envObj);
  res.json({ saved: true });
});

// GET /bots/:id/logs/stream  — SSE real-time log stream
router.get("/bots/:id/logs/stream", (req, res: Response) => {
  const id = req.params.id;
  if (!getBot(id)) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send existing logs immediately
  const existing = getBotLogs(id) ?? [];
  for (const entry of existing) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  // Subscribe to new logs
  const unsubscribe = subscribeToLogs(id, (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
