import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Shield, Lock, Coins, Sparkles, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUser, useAuth, SignInButton } from "@clerk/react";

declare global {
  interface Window {
    Moyasar: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

const PUBLISHABLE_KEY = (import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string | undefined) || "";
const TEST_KEY = (import.meta.env.VITE_MOYASAR_TEST_KEY as string | undefined) || "";

function isDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    h.endsWith(".replit.dev") ||
    h.endsWith(".repl.co") ||
    h === "localhost" ||
    h === "127.0.0.1"
  );
}

function pickMoyasarKey(): string {
  if (isDevHost() && TEST_KEY) return TEST_KEY;
  return PUBLISHABLE_KEY || TEST_KEY || "";
}

const MOYASAR_KEY = pickMoyasarKey();

const R = {
  bg: "#FAF7F2",
  bgCard: "#FFFFFF",
  bgChip: "#F0EAE3",
  text: "#0D0D0D",
  muted: "#6B6B6B",
  border: "#E8DDD5",
  orange: "#F26207",
  orangeDark: "#D95600",
  orangeLight: "#FEF3EC",
  purple: "#7C3AED",
  purpleLight: "#F5F3FF",
  green: "#10B981",
};

interface PlanInfo {
  key: "pro" | "unlimited";
  monthlySar: number;
  yearlySar: number;
  color: string;
  light: string;
  tokensKey: string;
  featureKeys: string[];
}

const PLANS: Record<string, PlanInfo> = {
  pro: {
    key: "pro",
    monthlySar: 37,
    yearlySar: 370,
    color: R.orange,
    light: R.orangeLight,
    tokensKey: "500 tokens / mo",
    featureKeys: [
      "Up to 5 projects",
      "500 Agent-4 tokens / mo",
      "24/7 uptime",
      "Priority resources",
      "Daily auto backups",
      "GitHub sync",
      "Discord priority support",
      "Remove NexusOps badge",
    ],
  },
  unlimited: {
    key: "unlimited",
    monthlySar: 75,
    yearlySar: 750,
    color: R.purple,
    light: R.purpleLight,
    tokensKey: "Unlimited tokens",
    featureKeys: [
      "Unlimited projects",
      "Unlimited Agent-4 tokens",
      "Everything in Pro",
      "Doubled exclusive resources",
      "SLA-guaranteed support",
      "Custom API access",
      "Dev / Prod environments",
      "Enterprise dashboard",
    ],
  },
};

function getParams(): { plan: string; billing: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    plan: params.get("plan") ?? "pro",
    billing: params.get("billing") ?? "monthly",
  };
}

/* ─── Moyasar form sub-component — fully remounts on key change ─────── */
interface MoyasarFormProps {
  amount: number;
  description: string;
  planKey: string;
  billing: string;
  planName: string;
  accentColor: string;
  accentLight: string;
  userId: string;
}

function MoyasarForm({ amount, description, planKey, billing, planName, accentColor, accentLight, userId }: MoyasarFormProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading-sdk" | "ready" | "error">("loading-sdk");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initialized = useRef(false);
  const formId = `mysr-${planKey}-${billing}`;

  /* Load Moyasar SDK once globally */
  useEffect(() => {
    if (window.Moyasar) { setStatus("ready"); return; }

    if (!document.getElementById("moyasar-css")) {
      const link = document.createElement("link");
      link.id = "moyasar-css";
      link.rel = "stylesheet";
      link.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
      document.head.appendChild(link);
    }

    const existing = document.getElementById("moyasar-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setStatus("ready"), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "moyasar-js";
    script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
    script.async = true;
    script.onload = () => setStatus("ready");
    script.onerror = () => {
      setStatus("error");
      setErrorMsg(t("checkout.loadFailed"));
    };
    document.head.appendChild(script);
  }, [t]);

  /* Init Moyasar when SDK is ready */
  useEffect(() => {
    if (status !== "ready" || initialized.current) return;
    if (!window.Moyasar) return;
    if (!MOYASAR_KEY) {
      setStatus("error");
      setErrorMsg(t("checkout.missingKey"));
      return;
    }

    initialized.current = true;

    const callbackUrl = `${window.location.origin}${base}/payment-success?plan=${planKey}&billing=${billing}`;

    const dev = isDevHost();
    // Apple Pay requires a Moyasar-registered merchant domain + Apple's domain-association file.
    // On Replit dev hosts (or any non-registered domain) Apple Pay validation fails silently
    // and the entire form gets stuck on "Loading". So we exclude it on dev hosts.
    // STC Pay similarly needs to be enabled per-merchant — keep it only in production where
    // the merchant account is verified. On dev, default to credit card only.
    const methods = dev ? ["creditcard"] : ["applepay", "creditcard", "stcpay"];

    const config: Record<string, unknown> = {
      element: `#${formId}`,
      amount,
      currency: "SAR",
      description,
      publishable_api_key: MOYASAR_KEY,
      callback_url: callbackUrl,
      // Webhook on the server reads these to activate the subscription server-side
      // even if the user closes the tab after paying.
      metadata: {
        userId,
        plan: planKey,
        billing,
      },
      methods,
      on_failure: (error: unknown) => {
        console.error("Moyasar payment failure:", error);
      },
    };

    if (!dev) {
      config.apple_pay = {
        country: "SA",
        label: planName,
        validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
      };
    }

    if (dev) {
      console.info(
        "[Moyasar] init",
        "key=" + MOYASAR_KEY.slice(0, 8) + "…",
        "host=" + window.location.hostname,
        "methods=" + methods.join(","),
      );
    }

    try {
      window.Moyasar.init(config);
    } catch (err) {
      console.error("Moyasar init error:", err);
      setStatus("error");
      setErrorMsg(t("checkout.initError"));
    }
  }, [status, amount, description, planKey, billing, planName, formId, userId, t]);

  if (status === "error") {
    return (
      <div style={{ padding: 16, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, color: "#DC2626", fontSize: 13, lineHeight: 1.6 }}>
        {errorMsg}
      </div>
    );
  }

  return (
    <>
      {status === "loading-sdk" && (
        <div style={{ padding: 32, textAlign: "center", color: R.muted, fontSize: 14 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${R.border}`, borderTopColor: accentColor, borderRadius: "50%", margin: "0 auto 12px", animation: "nx-spin 0.8s linear infinite" }} />
          {t("checkout.loadingGateway")}
        </div>
      )}

      <div id={formId} />

      <style>{`
        @keyframes nx-spin { to { transform: rotate(360deg); } }
        @keyframes nx-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes nx-pulse { 0%, 100% { box-shadow: 0 0 0 0 ${accentColor}40; } 50% { box-shadow: 0 0 0 8px ${accentColor}00; } }
        #${formId} input, #${formId} select {
          font-family: inherit !important;
          border-radius: 10px !important;
          border: 1.5px solid ${R.border} !important;
          background: ${R.bg} !important;
          font-size: 14px !important;
          padding: 10px 12px !important;
          transition: all 0.18s ease !important;
        }
        #${formId} input:hover, #${formId} select:hover {
          border-color: ${accentColor}80 !important;
        }
        #${formId} input:focus, #${formId} select:focus {
          border-color: ${accentColor} !important;
          outline: none !important;
          box-shadow: 0 0 0 3px ${accentLight} !important;
        }
        #${formId} button[type="submit"] {
          background: ${accentColor} !important;
          border-radius: 10px !important;
          font-family: inherit !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          padding: 13px !important;
          width: 100% !important;
          border: none !important;
          color: white !important;
          cursor: pointer !important;
          margin-top: 10px !important;
          transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.18s ease !important;
          animation: nx-pulse 2.4s ease-in-out infinite !important;
        }
        #${formId} button[type="submit"]:hover {
          transform: translateY(-1px) !important;
          opacity: 0.96 !important;
          box-shadow: 0 8px 20px ${accentColor}50 !important;
        }
        #${formId} button[type="submit"]:active { transform: translateY(0) !important; }
        #${formId} label {
          font-family: inherit !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: ${R.text} !important;
        }
        #${formId} .mysr-method-tab {
          border-radius: 10px !important;
          border: 1.5px solid ${R.border} !important;
          transition: all 0.15s ease !important;
        }
        #${formId} .mysr-method-tab:hover {
          border-color: ${accentColor}80 !important;
          background: ${accentLight}80 !important;
        }
        #${formId} .mysr-method-tab.active {
          border-color: ${accentColor} !important;
          background: ${accentLight} !important;
        }
      `}</style>
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */

export default function Checkout() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const { isLoaded, isSignedIn } = useUser();
  const { userId } = useAuth();
  const { plan: planKey, billing } = getParams();
  const planInfo = PLANS[planKey] ?? PLANS["pro"];
  const isYearly = billing === "yearly";
  const amountSar = isYearly ? planInfo.yearlySar : planInfo.monthlySar;
  const amountHalala = amountSar * 100;

  const accentColor = planInfo.color;
  const accentLight = planInfo.light;

  // Hover state for plan toggle micro-interactions
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  // Force MoyasarForm full remount on plan/billing change
  const formKey = `${planKey}-${billing}-${userId ?? "anon"}`;

  const planLabel = t(`projectTypes.${planInfo.key}`, { defaultValue: planInfo.key === "pro" ? "Pro" : "Unlimited" });
  const planName = `NexusOps ${planInfo.key === "pro" ? "Pro" : "Unlimited"}`;

  return (
    <div style={{ minHeight: "100dvh", background: R.bg, fontFamily: "'Cairo', 'Inter', sans-serif", direction: isRtl ? "rtl" : "ltr" }}>

      {/* Navbar */}
      <header style={{ height: 60, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${R.border}`, background: R.bg, position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(8px)" }}>
        <Link href={`${base}/`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", transition: "opacity 0.15s ease" }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
              <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
              <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: R.text }}>
            Nexus<span style={{ color: R.orange }}>Ops</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: R.green, fontWeight: 600, padding: "5px 10px", background: "#ECFDF5", borderRadius: 99 }}>
          <Lock size={12} />
          {t("checkout.secureBadge")}
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "1fr 380px", gap: 32, alignItems: "start", animation: "nx-fade-up 0.4s ease" }}>

        {/* Left — Order summary */}
        <div>
          <Link href={`${base}/pricing`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: R.muted, fontSize: 13, fontWeight: 500, textDecoration: "none", marginBottom: 16, transition: "color 0.15s ease" }}>
            {isRtl ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
            {t("nav.pricing")}
          </Link>

          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 600, color: R.text, marginBottom: 8, lineHeight: 1.1 }}>
            {t("checkout.title")}
          </h1>
          <p style={{ fontSize: 14, color: R.muted, marginBottom: 28 }}>
            {planName} — {isYearly ? t("checkout.subtitleYearly") : t("checkout.subtitleMonthly")}
          </p>

          {/* Billing toggle */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, background: R.bgChip, borderRadius: 99, padding: 3, marginBottom: 18 }}>
            <Link
              href={`${base}/checkout?plan=${planKey}&billing=monthly`}
              style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, borderRadius: 99, textDecoration: "none",
                background: !isYearly ? R.bgCard : "transparent",
                color: !isYearly ? R.text : R.muted,
                boxShadow: !isYearly ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s ease" }}
            >{t("checkout.monthly")}</Link>
            <Link
              href={`${base}/checkout?plan=${planKey}&billing=yearly`}
              style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, borderRadius: 99, textDecoration: "none",
                background: isYearly ? R.bgCard : "transparent",
                color: isYearly ? R.text : R.muted,
                boxShadow: isYearly ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s ease" }}
            >
              {t("checkout.yearly")}
              <span style={{ fontSize: 9, background: R.green, color: "#fff", padding: "2px 7px", borderRadius: 99, fontWeight: 700, letterSpacing: 0.2 }}>{t("checkout.save17")}</span>
            </Link>
          </div>

          {/* Plan toggle */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {Object.entries(PLANS).map(([key, p]) => {
              const isActive = planKey === key;
              const isHover = hoveredPlan === key;
              return (
                <Link
                  key={key}
                  href={`${base}/checkout?plan=${key}&billing=${billing}`}
                  onMouseEnter={() => setHoveredPlan(key)}
                  onMouseLeave={() => setHoveredPlan(null)}
                  style={{
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 10,
                    textDecoration: "none",
                    background: isActive ? p.color : (isHover ? p.light : "transparent"),
                    color: isActive ? "#fff" : R.text,
                    border: `1.5px solid ${isActive ? p.color : (isHover ? p.color : R.border)}`,
                    transform: isHover && !isActive ? "translateY(-1px)" : "translateY(0)",
                    boxShadow: isActive ? `0 4px 14px ${p.color}50` : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  {key === "pro" ? "Pro" : "Unlimited"}
                </Link>
              );
            })}
          </div>

          {/* Order box */}
          <div style={{
            background: R.bgCard,
            border: `2px solid ${accentColor}`,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: `0 0 0 4px ${accentLight}, 0 4px 20px rgba(0,0,0,0.06)`,
            transition: "all 0.3s ease",
          }} key={`order-${planKey}-${billing}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: `1px solid ${R.border}` }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, color: R.text }}>{planName}</p>
                <p style={{ fontSize: 13, color: R.muted, marginTop: 2 }}>
                  {isYearly ? t("checkout.yearly") : t("checkout.monthly")} · {planLabel}
                </p>
              </div>
              <div style={{ textAlign: isRtl ? "left" : "right" }}>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, color: R.text, letterSpacing: -0.5 }}>
                  {amountSar} <span style={{ fontSize: 14, fontWeight: 600 }}>SAR</span>
                </p>
                <p style={{ fontSize: 12, color: R.muted, marginTop: 2 }}>
                  {isYearly ? t("checkout.perYear") : t("checkout.perMonth")}
                </p>
              </div>
            </div>

            {isYearly && (
              <div style={{ margin: "14px 0 0", padding: "10px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, fontSize: 12, color: "#166534", fontWeight: 600, animation: "nx-fade-up 0.4s ease" }}>
                {t("checkout.saved2Months", { amount: planInfo.monthlySar * 2 })}
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", background: accentLight, borderRadius: 10 }}>
              <Coins size={15} color={accentColor} />
              <span style={{ fontSize: 13, color: R.text, fontWeight: 600 }}>{planInfo.tokensKey}</span>
            </div>

            <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {planInfo.featureKeys.map((f, idx) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: R.text, animation: `nx-fade-up 0.3s ease ${0.05 * idx}s both` }}>
                  <span style={{ width: 18, height: 18, borderRadius: 99, background: accentColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CheckCircle2 size={10} color="white" strokeWidth={3} />
                  </span>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Trust badges */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { icon: <Shield size={14} />, text: t("checkout.trustSsl") },
              { icon: <Lock size={14} />, text: t("checkout.trustNoStore") },
              { icon: <Sparkles size={14} />, text: t("checkout.trustCancel") },
            ].map((b, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: R.muted }}>
                {b.icon} {b.text}
              </div>
            ))}
          </div>
        </div>

        {/* Right — Payment form */}
        <div>
          <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: R.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={14} color={accentColor} />
              {t("checkout.paymentDetails")}
            </p>

            {!isLoaded ? (
              <div style={{ padding: 32, textAlign: "center", color: R.muted, fontSize: 14 }}>
                <div style={{ width: 28, height: 28, border: `3px solid ${R.border}`, borderTopColor: accentColor, borderRadius: "50%", margin: "0 auto 10px", animation: "nx-spin 0.8s linear infinite" }} />
              </div>
            ) : !isSignedIn || !userId ? (
              <div style={{ padding: 16, background: R.orangeLight, border: `1px solid ${R.orange}40`, borderRadius: 10, fontSize: 13, color: R.text, textAlign: "center" }}>
                <p style={{ marginBottom: 12, lineHeight: 1.6 }}>{t("checkout.loginRequired")}</p>
                <SignInButton mode="modal" forceRedirectUrl={window.location.pathname + window.location.search}>
                  <button style={{ padding: "10px 24px", background: R.orange, color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                    {t("checkout.signInBtn")}
                  </button>
                </SignInButton>
              </div>
            ) : (
              <MoyasarForm
                key={formKey}
                amount={amountHalala}
                description={`${planName} — ${isYearly ? t("checkout.yearly") : t("checkout.monthly")}`}
                planKey={planKey}
                billing={billing}
                planName={planName}
                accentColor={accentColor}
                accentLight={accentLight}
                userId={userId}
              />
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${R.border}` }}>
              <p style={{ fontSize: 11, color: R.muted, marginBottom: 10, textAlign: "center" }}>{t("checkout.acceptedMethods")}</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                {["Mada", "Visa", "Mastercard", "Apple Pay", "STC Pay"].map(m => (
                  <span key={m} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", background: R.bgChip, border: `1px solid ${R.border}`, borderRadius: 6, color: R.text }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 14 }}>
            <a href="https://moyasar.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: R.muted, textDecoration: "none" }}>
              {t("checkout.poweredBy")} <span style={{ fontWeight: 700 }}>Moyasar</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
