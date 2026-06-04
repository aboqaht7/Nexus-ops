import { schedule, validate, type ScheduledTask } from "node-cron";
import { db } from "@workspace/db";
import { botSchedules } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { startBot, getBot } from "./bot-manager.js";
import { logger } from "./logger.js";

const tasks = new Map<number, ScheduledTask>();

export function validateCron(expr: string): boolean {
  return validate(expr);
}

async function runSchedule(scheduleId: number) {
  const rows = await db
    .select()
    .from(botSchedules)
    .where(and(eq(botSchedules.id, scheduleId), eq(botSchedules.enabled, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return;

  const bot = getBot(row.botId);
  if (!bot) {
    logger.warn({ scheduleId, botId: row.botId }, "Scheduled bot not found");
    await db
      .update(botSchedules)
      .set({ lastRunAt: new Date(), lastRunStatus: "error" })
      .where(eq(botSchedules.id, scheduleId));
    return;
  }

  try {
    if (bot.status === "running") {
      await db
        .update(botSchedules)
        .set({ lastRunAt: new Date(), lastRunStatus: "skipped" })
        .where(eq(botSchedules.id, scheduleId));
    } else {
      startBot(row.botId);
      await db
        .update(botSchedules)
        .set({ lastRunAt: new Date(), lastRunStatus: "ok" })
        .where(eq(botSchedules.id, scheduleId));
    }
  } catch (err) {
    logger.error({ err, scheduleId, botId: row.botId }, "Cron run error");
    await db
      .update(botSchedules)
      .set({ lastRunAt: new Date(), lastRunStatus: "error" })
      .where(eq(botSchedules.id, scheduleId));
  }
}

function registerTask(id: number, expr: string) {
  const existing = tasks.get(id);
  if (existing) { existing.stop(); tasks.delete(id); }
  const task = schedule(expr, () => { void runSchedule(id); }, { timezone: "Asia/Riyadh" });
  tasks.set(id, task);
}

function unregisterTask(id: number) {
  const t = tasks.get(id);
  if (t) { t.stop(); tasks.delete(id); }
}

export async function initCronManager() {
  const all = await db
    .select()
    .from(botSchedules)
    .where(eq(botSchedules.enabled, true));

  for (const row of all) {
    if (validate(row.cronExpression)) {
      registerTask(row.id, row.cronExpression);
    }
  }
  logger.info({ count: tasks.size }, "Cron manager initialized");
}

export async function activateSchedule(id: number, expr: string) {
  if (!validate(expr)) throw new Error("Invalid cron expression");
  registerTask(id, expr);
}

export function deactivateSchedule(id: number) {
  unregisterTask(id);
}
