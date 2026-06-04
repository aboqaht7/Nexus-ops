import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, botSchedules } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getBot } from "../lib/bot-manager.js";
import { validateCron, activateSchedule, deactivateSchedule } from "../lib/cron-manager.js";

const router: IRouter = Router();

function getUserId(req: Request): string | undefined {
  return getAuth(req).userId ?? undefined;
}

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!getUserId(req)) { res.status(401).json({ error: "unauthorized" }); return; }
  next();
}

function requireBotOwner(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "unauthorized" }); return; }
  const { id } = req.params as { id: string };
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "bot not found" }); return; }
  if (bot.userId !== userId) { res.status(403).json({ error: "forbidden" }); return; }
  next();
}

/* GET /api/bots/:id/schedules */
router.get("/bots/:id/schedules", requireBotOwner, async (req, res) => {
  const { id } = req.params as { id: string };
  const rows = await db
    .select()
    .from(botSchedules)
    .where(eq(botSchedules.botId, id))
    .orderBy(botSchedules.createdAt);
  res.json(rows);
});

/* POST /api/bots/:id/schedules */
router.post("/bots/:id/schedules", requireBotOwner, async (req, res) => {
  const { id } = req.params as { id: string };
  const userId = getUserId(req)!;
  const body = req.body as { cronExpression?: string; label?: string; enabled?: boolean };

  const expr = (body.cronExpression ?? "").trim();
  const label = (body.label ?? "").trim() || "مهمة مجدوَلة";
  const enabled = body.enabled !== false;

  if (!expr) { res.status(400).json({ error: "cronExpression required" }); return; }
  if (!validateCron(expr)) { res.status(400).json({ error: "Invalid cron expression" }); return; }

  const [row] = await db
    .insert(botSchedules)
    .values({ botId: id, userId, cronExpression: expr, label, enabled })
    .returning();

  if (enabled && row) await activateSchedule(row.id, expr);

  res.status(201).json(row);
});

/* PATCH /api/bots/:id/schedules/:sid */
router.patch("/bots/:id/schedules/:sid", requireUser, async (req, res) => {
  const { id, sid } = req.params as { id: string; sid: string };
  const userId = getUserId(req)!;
  const scheduleId = Number(sid);
  if (!Number.isFinite(scheduleId)) { res.status(400).json({ error: "invalid id" }); return; }

  const existing = await db
    .select()
    .from(botSchedules)
    .where(and(eq(botSchedules.id, scheduleId), eq(botSchedules.botId, id), eq(botSchedules.userId, userId)))
    .limit(1);
  if (!existing[0]) { res.status(404).json({ error: "schedule not found" }); return; }

  const body = req.body as { cronExpression?: string; label?: string; enabled?: boolean };
  const updates: Partial<typeof botSchedules.$inferInsert> = {};

  if (body.cronExpression !== undefined) {
    const expr = body.cronExpression.trim();
    if (!validateCron(expr)) { res.status(400).json({ error: "Invalid cron expression" }); return; }
    updates.cronExpression = expr;
  }
  if (body.label !== undefined) updates.label = body.label.trim() || existing[0].label;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  const [updated] = await db
    .update(botSchedules)
    .set(updates)
    .where(eq(botSchedules.id, scheduleId))
    .returning();

  const finalEnabled = updated?.enabled ?? false;
  const finalExpr = updated?.cronExpression ?? existing[0].cronExpression;

  if (finalEnabled) {
    await activateSchedule(scheduleId, finalExpr);
  } else {
    deactivateSchedule(scheduleId);
  }

  res.json(updated);
});

/* DELETE /api/bots/:id/schedules/:sid */
router.delete("/bots/:id/schedules/:sid", requireUser, async (req, res) => {
  const { id, sid } = req.params as { id: string; sid: string };
  const userId = getUserId(req)!;
  const scheduleId = Number(sid);
  if (!Number.isFinite(scheduleId)) { res.status(400).json({ error: "invalid id" }); return; }

  const existing = await db
    .select()
    .from(botSchedules)
    .where(and(eq(botSchedules.id, scheduleId), eq(botSchedules.botId, id), eq(botSchedules.userId, userId)))
    .limit(1);
  if (!existing[0]) { res.status(404).json({ error: "schedule not found" }); return; }

  deactivateSchedule(scheduleId);
  await db.delete(botSchedules).where(eq(botSchedules.id, scheduleId));
  res.json({ deleted: true });
});

export default router;
