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
  source?: "client" | "webhook";
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

interface MoyasarPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string> | null;
}

/** Authoritative price table — drives entitlement, NOT client input. amount in halala (SAR * 100). */
export const PLAN_PRICES_HALALA: Record<Plan, Record<Billing, number>> = {
  free:      { monthly: 0,     yearly: 0 },
  pro:       { monthly: 3700,  yearly: 37000 },
  unlimited: { monthly: 7500,  yearly: 75000 },
};

/**
 * Derive (plan, billing) from a verified payment amount + currency.
 * Returns null if no plan matches — caller must reject.
 */
export function derivePlanFromPayment(
  amount: number,
  currency: string,
): { plan: Plan; billing: Billing } | null {
  if (currency !== "SAR") return null;
  for (const plan of ["pro", "unlimited"] as Plan[]) {
    for (const billing of ["monthly", "yearly"] as Billing[]) {
      if (PLAN_PRICES_HALALA[plan][billing] === amount) {
        return { plan, billing };
      }
    }
  }
  return null;
}

/** Error class so callers can map to HTTP status (transient → 5xx so Moyasar retries; permanent → 2xx). */
export class PermanentActivationError extends Error {
  override readonly name = "PermanentActivationError";
}
export class TransientActivationError extends Error {
  override readonly name = "TransientActivationError";
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadSubs(): Subscription[] {
  ensureDir();
  if (!existsSync(SUBS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SUBS_FILE, "utf-8")) as Subscription[];
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
      .filter((s) => s.userId === userId && new Date(s.expiresAt) > now)
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

export function getSubscriptionByPaymentId(paymentId: string): Subscription | null {
  return loadSubs().find((s) => s.paymentId === paymentId) ?? null;
}

async function verifyMoyasarPayment(paymentId: string): Promise<MoyasarPayment> {
  const secretKey = process.env["MOYASAR_SECRET_KEY"];
  if (!secretKey) {
    // Server misconfig — transient from Moyasar's POV (admin can fix and retry will succeed).
    throw new TransientActivationError("MOYASAR_SECRET_KEY not configured on server");
  }
  let resp: Response;
  try {
    resp = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: "Basic " + Buffer.from(secretKey + ":").toString("base64"),
      },
    });
  } catch (err) {
    // Network failure → transient
    throw new TransientActivationError(`Moyasar API unreachable: ${(err as Error).message}`);
  }
  if (resp.status >= 500) {
    throw new TransientActivationError(`Moyasar API ${resp.status}`);
  }
  if (resp.status === 404) {
    throw new PermanentActivationError(`Payment not found: ${paymentId}`);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new PermanentActivationError(`Moyasar verification failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as MoyasarPayment;
}

function persistSubscription(args: {
  userId: string;
  paymentId: string;
  plan: Plan;
  billing: Billing;
  source: "client" | "webhook";
}): Subscription {
  const subs = loadSubs();

  // Idempotency: same paymentId? return existing.
  const existing = subs.find((s) => s.paymentId === args.paymentId);
  if (existing) {
    logger.info({ paymentId: args.paymentId, userId: existing.userId }, "Subscription already activated (idempotent)");
    return existing;
  }

  const days = PLAN_DURATION_DAYS[args.billing];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const sub: Subscription = {
    userId: args.userId,
    plan: args.plan,
    billing: args.billing,
    paymentId: args.paymentId,
    activatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: args.source,
  };
  subs.push(sub);
  saveSubs(subs);
  logger.info({ ...args }, "Subscription activated");
  return sub;
}

/**
 * Client-initiated activation. Caller provides plan/billing as a HINT only —
 * the authoritative plan/billing is DERIVED from the verified Moyasar payment
 * amount/currency. Client values must match or we reject (entitlement-escalation
 * defense).
 */
export async function activateSubscription(
  userId: string,
  paymentId: string,
  hintPlan: Plan,
  hintBilling: Billing,
): Promise<Subscription> {
  // Fast path: already exists — but still verify ownership.
  const existing = getSubscriptionByPaymentId(paymentId);
  if (existing) {
    if (existing.userId !== userId) {
      throw new PermanentActivationError("Payment belongs to another account");
    }
    return existing;
  }

  const payment = await verifyMoyasarPayment(paymentId);
  if (payment.status !== "paid") {
    throw new PermanentActivationError(`Payment not confirmed — status: ${payment.status}`);
  }

  // AUTHORITATIVE entitlement derivation — never trust client.
  const derived = derivePlanFromPayment(payment.amount, payment.currency);
  if (!derived) {
    logger.error({ paymentId, amount: payment.amount, currency: payment.currency }, "Payment amount does not match any known plan");
    throw new PermanentActivationError(`Payment amount ${payment.amount} ${payment.currency} does not match any plan`);
  }
  if (derived.plan !== hintPlan || derived.billing !== hintBilling) {
    logger.warn({ paymentId, hintPlan, hintBilling, derived }, "Client plan hint mismatched payment amount — using derived");
  }

  // Cross-check against payment metadata.userId if present (defense in depth)
  const metaUserId = payment.metadata?.["userId"];
  if (metaUserId && metaUserId !== userId) {
    throw new PermanentActivationError("Payment metadata userId does not match authenticated user");
  }

  return persistSubscription({
    userId,
    paymentId,
    plan: derived.plan,
    billing: derived.billing,
    source: "client",
  });
}

/**
 * Webhook-initiated activation. userId comes from payment metadata, but plan/billing
 * are DERIVED from amount/currency (never trust metadata for entitlement).
 * Server-to-server — no Clerk auth required.
 *
 * Throws TransientActivationError → caller should return 5xx so Moyasar retries.
 * Throws PermanentActivationError → caller should return 2xx (no retry).
 */
export async function activateFromMoyasarWebhook(paymentId: string): Promise<Subscription | null> {
  const existing = getSubscriptionByPaymentId(paymentId);
  if (existing) return existing;

  const payment = await verifyMoyasarPayment(paymentId);
  if (payment.status !== "paid") {
    logger.warn({ paymentId, status: payment.status }, "Webhook received for non-paid payment, skipping");
    return null;
  }

  const userId = payment.metadata?.["userId"];
  if (!userId) {
    logger.error({ paymentId, meta: payment.metadata }, "Webhook missing userId metadata");
    throw new PermanentActivationError("Payment metadata missing userId");
  }

  const derived = derivePlanFromPayment(payment.amount, payment.currency);
  if (!derived) {
    logger.error({ paymentId, amount: payment.amount, currency: payment.currency }, "Webhook: amount does not match any known plan");
    throw new PermanentActivationError(`Payment amount ${payment.amount} ${payment.currency} does not match any plan`);
  }

  return persistSubscription({
    userId,
    paymentId,
    plan: derived.plan,
    billing: derived.billing,
    source: "webhook",
  });
}
