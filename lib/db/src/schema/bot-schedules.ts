import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botSchedules = pgTable("bot_schedules", {
  id: serial("id").primaryKey(),
  botId: text("bot_id").notNull(),
  userId: text("user_id").notNull(),
  cronExpression: text("cron_expression").notNull(),
  label: text("label").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: text("last_run_status"), // 'ok' | 'skipped' | 'error'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotScheduleSchema = createInsertSchema(botSchedules).omit({
  id: true,
  lastRunAt: true,
  lastRunStatus: true,
  createdAt: true,
});

export type BotSchedule = typeof botSchedules.$inferSelect;
export type InsertBotSchedule = z.infer<typeof insertBotScheduleSchema>;
