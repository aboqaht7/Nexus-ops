import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { timingSafeEqual } from "node:crypto";
import { getBot, getBotKvToken } from "../lib/bot-manager.js";
import {
  kvGet, kvSet, kvDelete, kvList, kvClear, kvIsValidKey,
} from "../lib/kv-store.js";

const router: IRouter = Router();

function getUserId(req: Request): string | undefined {
  return getAuth(req).userId ?? undefined;
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function parseIntSafe(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/* ──────────────────────────────────────────────────────────────────────────
 * INTERNAL ROUTES (used by bot child-processes via BOT_KV_TOKEN)
 * Mounted at /api/internal/kv/:botId/...
 * ────────────────────────────────────────────────────────────────────────── */

function botTokenAuth(req: Request, res: Response, next: NextFunction) {
  const { botId } = req.params as { botId: string };
  const provided = (req.header("x-bot-kv-token") || "").trim();
  const expected = getBotKvToken(botId);
  if (!expected || !provided || !safeEq(provided, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

router.get("/internal/kv/:botId", botTokenAuth, (req, res) => {
  const { botId } = req.params as { botId: string };
  const prefix = (req.query.prefix as string | undefined) || undefined;
  const limit = parseIntSafe(req.query.limit, 100, 1, 1000);
  const offset = parseIntSafe(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  res.json(kvList(botId, { prefix, limit, offset }));
});

router.get("/internal/kv/:botId/:key", botTokenAuth, (req, res) => {
  const { botId, key } = req.params as { botId: string; key: string };
  if (!kvIsValidKey(key)) { res.status(400).json({ error: "invalid key" }); return; }
  const entry = kvGet(botId, key);
  if (!entry) { res.status(404).json({ error: "not found" }); return; }
  res.json(entry);
});

router.put("/internal/kv/:botId/:key", botTokenAuth, (req, res) => {
  const { botId, key } = req.params as { botId: string; key: string };
  const body = req.body as { value?: unknown };
  if (!kvIsValidKey(key)) { res.status(400).json({ error: "invalid key" }); return; }
  if (typeof body?.value !== "string") { res.status(400).json({ error: "value must be a string" }); return; }
  try {
    res.json(kvSet(botId, key, body.value));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.delete("/internal/kv/:botId/:key", botTokenAuth, (req, res) => {
  const { botId, key } = req.params as { botId: string; key: string };
  if (!kvIsValidKey(key)) { res.status(400).json({ error: "invalid key" }); return; }
  res.json({ deleted: kvDelete(botId, key) });
});

/* ──────────────────────────────────────────────────────────────────────────
 * USER-FACING ROUTES (Clerk auth + ownership)
 * Mounted at /api/bots/:id/kv
 * ────────────────────────────────────────────────────────────────────────── */

function ownerGuard(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "unauthorized" }); return; }
  const { id } = req.params as { id: string };
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "bot not found" }); return; }
  if (bot.userId !== userId) { res.status(403).json({ error: "forbidden" }); return; }
  next();
}

router.get("/bots/:id/kv", ownerGuard, (req, res) => {
  const { id } = req.params as { id: string };
  const prefix = (req.query.prefix as string | undefined) || undefined;
  const limit = parseIntSafe(req.query.limit, 100, 1, 1000);
  const offset = parseIntSafe(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  res.json(kvList(id, { prefix, limit, offset }));
});

router.get("/bots/:id/kv/:key", ownerGuard, (req, res) => {
  const { id, key } = req.params as { id: string; key: string };
  if (!kvIsValidKey(key)) { res.status(400).json({ error: "invalid key" }); return; }
  const entry = kvGet(id, key);
  if (!entry) { res.status(404).json({ error: "not found" }); return; }
  res.json(entry);
});

router.put("/bots/:id/kv/:key", ownerGuard, (req, res) => {
  const { id, key } = req.params as { id: string; key: string };
  const body = req.body as { value?: unknown };
  if (!kvIsValidKey(key)) { res.status(400).json({ error: "invalid key" }); return; }
  if (typeof body?.value !== "string") { res.status(400).json({ error: "value must be a string" }); return; }
  try {
    res.json(kvSet(id, key, body.value));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.delete("/bots/:id/kv/:key", ownerGuard, (req, res) => {
  const { id, key } = req.params as { id: string; key: string };
  if (!kvIsValidKey(key)) { res.status(400).json({ error: "invalid key" }); return; }
  res.json({ deleted: kvDelete(id, key) });
});

router.delete("/bots/:id/kv", ownerGuard, (req, res) => {
  const { id } = req.params as { id: string };
  res.json({ deleted: kvClear(id) });
});

export default router;
