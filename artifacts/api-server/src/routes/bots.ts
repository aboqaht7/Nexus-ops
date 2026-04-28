import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { join, extname, basename } from "path";
import { writeFileSync } from "fs";
import { getAuth } from "@clerk/express";
import {
  listBots,
  getBot,
  deleteBot,
  startBot,
  stopBot,
  restartBot,
  getBotLogs,
  getStats,
  registerBot,
  getBotFilesDir,
  setBotFileContent,
} from "../lib/bot-manager.js";
import { getUserLimits } from "../lib/subscriptions.js";
import {
  ListBotsResponse,
  GetBotResponse,
  GetBotLogsResponse,
  GetBotsStatsResponse,
  StartBotResponse,
  StopBotResponse,
  RestartBotResponse,
  GetBotParams,
  DeleteBotParams,
  StartBotParams,
  StopBotParams,
  RestartBotParams,
  GetBotLogsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getUserId(req: Request): string | undefined {
  return getAuth(req).userId ?? undefined;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getBotFilesDir());
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const safe = basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${safe}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (ext === ".js" || ext === ".py" || ext === ".mjs" || ext === ".cjs") {
      cb(null, true);
    } else {
      cb(new Error("Only .js, .mjs, .cjs, and .py files are allowed"));
    }
  },
});

router.get("/bots/stats", (_req, res): void => {
  const stats = getStats();
  res.json(GetBotsStatsResponse.parse(stats));
});

router.get("/bots", (req, res): void => {
  const userId = getUserId(req);
  const bots = listBots(userId);
  res.json(ListBotsResponse.parse(bots));
});

router.post(
  "/bots/upload",
  upload.single("file"),
  (req, res): void => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const name = (req.body as { name?: string }).name?.trim();
    if (!name) {
      res.status(400).json({ error: "Bot name is required" });
      return;
    }

    const userId = getUserId(req);

    // Enforce plan limits
    const limits = getUserLimits(userId ?? "");
    if (limits.maxBots !== -1) {
      const existing = listBots(userId);
      if (existing.length >= limits.maxBots) {
        res.status(403).json({
          error: "PLAN_LIMIT",
          message: `وصلت للحد الأقصى من البوتات في خطتك الحالية (${limits.maxBots} بوت). رقّ خطتك للمتابعة.`,
          maxBots: limits.maxBots,
        });
        return;
      }
    }

    const bot = registerBot(name, req.file.filename, userId);
    res.status(201).json(bot);
  }
);

// POST /bots/create-from-code — create bot from text content (for templates)
router.post("/bots/create-from-code", (req, res): void => {
  const { name, code, language } = req.body as { name?: string; code?: string; language?: string };

  if (!name?.trim()) { res.status(400).json({ error: "Bot name is required" }); return; }
  if (!code?.trim()) { res.status(400).json({ error: "Bot code is required" }); return; }

  const userId = getUserId(req);

  // Enforce plan limits
  const limits = getUserLimits(userId ?? "");
  if (limits.maxBots !== -1) {
    const existing = listBots(userId);
    if (existing.length >= limits.maxBots) {
      res.status(403).json({
        error: "PLAN_LIMIT",
        message: `وصلت للحد الأقصى من البوتات في خطتك الحالية (${limits.maxBots} بوت). رقّ خطتك للمتابعة.`,
        maxBots: limits.maxBots,
      });
      return;
    }
  }

  const ext = language === "python" ? ".py" : ".js";
  const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeName}_${Date.now()}${ext}`;
  const filepath = join(getBotFilesDir(), filename);

  writeFileSync(filepath, code, "utf-8");

  const bot = registerBot(name.trim(), filename, userId);
  res.status(201).json(bot);
});

router.get("/bots/:id", (req, res): void => {
  const params = GetBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = getBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(GetBotResponse.parse(bot));
});

router.delete("/bots/:id", (req, res): void => {
  const params = DeleteBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ok = deleteBot(params.data.id);
  if (!ok) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/bots/:id/start", (req, res): void => {
  const params = StartBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = startBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(StartBotResponse.parse(bot));
});

router.post("/bots/:id/stop", (req, res): void => {
  const params = StopBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = stopBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(StopBotResponse.parse(bot));
});

router.post("/bots/:id/restart", (req, res): void => {
  const params = RestartBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = restartBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(RestartBotResponse.parse(bot));
});

router.get("/bots/:id/logs", (req, res): void => {
  const params = GetBotLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const logs = getBotLogs(params.data.id);
  if (!logs) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(GetBotLogsResponse.parse({ id: params.data.id, logs }));
});

export default router;
