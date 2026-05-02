import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  activateSubscription,
  activateFromMoyasarWebhook,
  getUserSubscription,
  getUserLimits,
  getSubscriptionByPaymentId,
  PLAN_LIMITS,
  TransientActivationError,
  type Plan,
  type Billing,
} from "../lib/subscriptions.js";
import { listBots } from "../lib/bot-manager.js";
import { logger } from "../lib/logger.js";

const router = Router();

// GET /subscriptions/me — current plan info
router.get("/subscriptions/me", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sub = getUserSubscription(userId);
  const plan = sub?.plan ?? "free";
  const limits = getUserLimits(userId);
  const bots = listBots(userId);

  res.json({
    plan,
    billing: sub?.billing ?? null,
    expiresAt: sub?.expiresAt ?? null,
    activatedAt: sub?.activatedAt ?? null,
    limits: {
      maxBots: limits.maxBots,
      tokensPerMonth: limits.tokensPerMonth,
    },
    usage: {
      bots: bots.length,
    },
    planLimits: PLAN_LIMITS,
  });
});

// GET /subscriptions/by-payment/:paymentId — poll endpoint for client to detect webhook activation
router.get("/subscriptions/by-payment/:paymentId", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sub = getSubscriptionByPaymentId(req.params.paymentId);
  if (!sub) { res.status(404).json({ activated: false }); return; }
  if (sub.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json({ activated: true, subscription: sub });
});

// POST /subscriptions/activate — fallback called from payment-success page
router.post("/subscriptions/activate", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { paymentId, plan, billing } = req.body as {
    paymentId?: string;
    plan?: Plan;
    billing?: Billing;
  };

  if (!paymentId || !plan || !billing) {
    res.status(400).json({ error: "paymentId, plan, and billing are required" });
    return;
  }
  if (!(["pro", "unlimited"] as Plan[]).includes(plan)) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }
  if (!(["monthly", "yearly"] as Billing[]).includes(billing)) {
    res.status(400).json({ error: "Invalid billing" });
    return;
  }

  try {
    const sub = await activateSubscription(userId, paymentId, plan, billing);
    res.json({ success: true, subscription: sub });
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e.message, userId, paymentId }, "Subscription activation failed");
    // Transient (Moyasar API down, missing secret) → 503 so client can retry
    const status = e instanceof TransientActivationError ? 503 : 402;
    res.status(status).json({ error: e.message });
  }
});

// POST /subscriptions/webhook — Moyasar server-to-server callback
// Configure in Moyasar dashboard: https://<domain>/api/subscriptions/webhook
// No Clerk auth — Moyasar can't authenticate as a user.
// Security: payment data is ALWAYS re-fetched from Moyasar API using our secret key.
router.post("/subscriptions/webhook", async (req, res): Promise<void> => {
  // Moyasar sends: { type: "payment_paid"|..., data: { id, status, ... } }
  const body = req.body as { type?: string; data?: { id?: string; status?: string } };
  const paymentId = body.data?.id;
  const eventType = body.type ?? "unknown";

  if (!paymentId) {
    logger.warn({ body }, "Webhook missing payment id");
    res.status(400).json({ error: "Missing payment id" });
    return;
  }

  // Only act on paid events. Acknowledge others with 200 to avoid retries.
  if (eventType !== "payment_paid" && body.data?.status !== "paid") {
    logger.info({ eventType, paymentId, status: body.data?.status }, "Webhook event ignored (not a paid event)");
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    const sub = await activateFromMoyasarWebhook(paymentId);
    if (!sub) {
      res.status(200).json({ ok: true, activated: false });
      return;
    }
    res.status(200).json({ ok: true, activated: true });
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e.message, paymentId }, "Webhook activation failed");
    if (e instanceof TransientActivationError) {
      // 503 so Moyasar retries — admin can fix the env/network issue.
      res.status(503).json({ ok: false, error: e.message, retry: true });
    } else {
      // Permanent (bad metadata, unknown amount) — 200 to stop retry storms.
      res.status(200).json({ ok: false, error: e.message });
    }
  }
});

export default router;
