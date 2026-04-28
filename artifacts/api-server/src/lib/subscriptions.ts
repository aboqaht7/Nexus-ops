import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { logger } from "./logger.js";

const DATA_DIR = join(process.cwd(), "data");
const SUBS_FILE = join(DATA_DIR, "subscriptions.json");

export type Plan = "free" | "pro" | "unlimited";
export type Billing = "monthly" | "yearly";

export interface Subscription {
  userId: string;
  plan: Plan;
  billing: Billing;
  paymentId: string;
  activatedAt: string;
  expiresAt: string;
}

export interface PlanLimits {
  maxBots: number;
  tokensPerMonth: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:      { maxBots: 1,  tokensPerMonth: 50 },
  pro:       { maxBots: 5,  tokensPerMonth: 500 },
  unlimited: { maxBots: -1, tokensPerMonth: -1 },
};

export const PLAN_DURATION_DAYS: Record<Billing, number> = {
  monthly: 31,
  yearly:  366,
};

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadSubs(): Subscription[] {
  ensureDir();
  if (!existsSync(SUBS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SUBS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveSubs(subs: Subscription[]): void {
  ensureDir();
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

export function getUserSubscription(userId: string): Subscription | null {
  const subs = loadSubs();
  const now = new Date();
  return (
    subs
      .filter(s => s.userId === userId && new Date(s.expiresAt) > now)
      .sort((a, b) => new Date(b.activatedAt).getTime() - new Date(a.activatedAt).getTime())[0]
    ?? null
  );
}

export function getUserPlan(userId: string): Plan {
  return getUserSubscription(userId)?.plan ?? "free";
}

export function getUserLimits(userId: string): PlanLimits {
  return PLAN_LIMITS[getUserPlan(userId)];
}

export async function activateSubscription(
  userId: string,
  paymentId: string,
  plan: Plan,
  billing: Billing,
): Promise<Subscription> {
  // Verify with Moyasar if secret key is available
  const secretKey = process.env["MOYASAR_SECRET_KEY"];
  if (secretKey) {
    try {
      const resp = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: "Basic " + Buffer.from(secretKey + ":").toString("base64"),
        },
      });
      if (!resp.ok) {
        throw new Error(`Moyasar verification failed: ${resp.status}`);
      }
      const data = await resp.json() as { status: string };
      if (data.status !== "paid") {
        throw new Error(`Payment not confirmed — status: ${data.status}`);
      }
    } catch (err) {
      logger.error({ err, paymentId }, "Moyasar payment verification failed");
      throw err;
    }
  } else {
    logger.warn({ paymentId }, "MOYASAR_SECRET_KEY not set — skipping server-side verification");
  }

  const subs = loadSubs();
  const days = PLAN_DURATION_DAYS[billing];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const sub: Subscription = {
    userId,
    plan,
    billing,
    paymentId,
    activatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  subs.push(sub);
  saveSubs(subs);
  logger.info({ userId, plan, billing, paymentId }, "Subscription activated");
  return sub;
}
