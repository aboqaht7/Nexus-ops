import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  activateSubscription,
  getUserSubscription,
  getUserPlan,
  getUserLimits,
  PLAN_LIMITS,
  type Plan,
  type Billing,
} from "../lib/subscriptions.js";
import { listBots } from "../lib/bot-manager.js";

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

// POST /subscriptions/activate — called after Moyasar redirect
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

  const validPlans: Plan[] = ["pro", "unlimited"];
  const validBillings: Billing[] = ["monthly", "yearly"];

  if (!validPlans.includes(plan)) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }
  if (!validBillings.includes(billing)) {
    res.status(400).json({ error: "Invalid billing" });
    return;
  }

  try {
    const sub = await activateSubscription(userId, paymentId, plan, billing);
    res.json({ success: true, subscription: sub });
  } catch (err) {
    res.status(402).json({ error: (err as Error).message });
  }
});

export default router;
