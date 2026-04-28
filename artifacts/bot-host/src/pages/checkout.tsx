import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Shield, Lock, Coins } from "lucide-react";

declare global {
  interface Window {
    Moyasar: {
      init: (config: Record<string, unknown>) => void;
    };
    ApplePaySession?: {
      canMakePayments: () => boolean;
      supportsVersion: (v: number) => boolean;
    };
  }
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const MOYASAR_KEY = (
  import.meta.env.DEV
    ? import.meta.env.VITE_MOYASAR_TEST_KEY
    : import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY
) as string;

const R = {
  bg: "#FAF7F2",
  bgCard: "#FFFFFF",
  bgChip: "#F0EAE3",
  text: "#0D0D0D",
  muted: "#6B6B6B",
  border: "#E8DDD5",
  orange: "#F26207",
  orangeLight: "#FEF3EC",
  purple: "#7C3AED",
  purpleLight: "#F5F3FF",
};

interface PlanInfo {
  nameAr: string;
  label: string;
  monthlySar: number;
  yearlySar: number;
  color: string;
  features: string[];
  tokens: string;
}

const PLANS: Record<string, PlanInfo> = {
  pro: {
    nameAr: "NexusOps Pro",
    label: "Pro",
    monthlySar: 37,
    yearlySar: 370,
    color: R.orange,
    tokens: "500 توكن / شهر",
    features: [
      "حتى 5 بوتات",
      "500 توكن Agent-4 شهرياً",
      "بوتات بدون انقطاع 24/7",
      "أولوية في الموارد",
      "نسخ احتياطي تلقائي يومي",
      "مزامنة GitHub",
      "دعم فوري عبر Discord",
      "إزالة شعار NexusOps",
    ],
  },
  unlimited: {
    nameAr: "NexusOps Unlimited",
    label: "Unlimited",
    monthlySar: 75,
    yearlySar: 750,
    color: R.purple,
    tokens: "توكنات غير محدودة",
    features: [
      "بوتات غير محدودة",
      "توكنات Agent-4 غير محدودة",
      "كل مميزات Pro",
      "موارد حصرية مضاعفة",
      "دعم SLA مضمون",
      "API مخصص",
      "بيئات Dev/Prod",
      "لوحة تحكم مؤسسية",
    ],
  },
};

function getParams() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan") ?? "pro";
  const billing = params.get("billing") ?? "monthly";
  return { plan, billing };
}

/* ─── Detect Apple Pay support ───────────────────────────────────────── */
function applePaySupported(): boolean {
  try {
    return !!(
      window.ApplePaySession &&
      window.ApplePaySession.supportsVersion(3) &&
      window.ApplePaySession.canMakePayments()
    );
  } catch {
    return false;
  }
}

/* ─── Moyasar form sub-component — remounts on key change ───────────── */
interface MoyasarFormProps {
  amount: number;
  description: string;
  planKey: string;
  billing: string;
  planName: string;
  accentColor: string;
  accentLight: string;
}

function MoyasarForm({ amount, description, planKey, billing, planName, accentColor, accentLight }: MoyasarFormProps) {
  const [status, setStatus] = useState<"loading-sdk" | "ready" | "error">("loading-sdk");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initialized = useRef(false);
  const formId = `mysr-${planKey}-${billing}`;

  /* Load Moyasar SDK once */
  useEffect(() => {
    const loadSdk = () => {
      if (window.Moyasar) { setStatus("ready"); return; }

      if (!document.getElementById("moyasar-css")) {
        const link = document.createElement("link");
        link.id = "moyasar-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
        document.head.appendChild(link);
      }

      if (document.getElementById("moyasar-js")) {
        if (window.Moyasar) setStatus("ready");
        else {
          const existing = document.getElementById("moyasar-js") as HTMLScriptElement;
          existing.addEventListener("load", () => setStatus("ready"), { once: true });
        }
        return;
      }

      const script = document.createElement("script");
      script.id = "moyasar-js";
      script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
      script.async = true;
      script.onload = () => setStatus("ready");
      script.onerror = () => {
        setStatus("error");
        setErrorMsg("تعذّر تحميل بوابة الدفع. تحقق من اتصالك بالإنترنت.");
      };
      document.head.appendChild(script);
    };

    loadSdk();
  }, []);

  /* Init Moyasar when SDK is ready */
  useEffect(() => {
    if (status !== "ready" || initialized.current) return;
    if (!window.Moyasar) return;
    if (!MOYASAR_KEY) {
      setStatus("error");
      setErrorMsg("مفتاح ميسر غير مضبوط — يرجى التحقق من إعدادات المشروع.");
      return;
    }

    initialized.current = true;

    // Build allowed payment methods — only include Apple Pay if device supports it
    const methods: string[] = ["creditcard", "stcpay"];
    if (applePaySupported()) methods.unshift("applepay");

    // Ensure callback URL uses current origin (HTTPS in production)
    const callbackUrl = `${window.location.origin}${base}/payment-success?plan=${planKey}&billing=${billing}`;

    const config: Record<string, unknown> = {
      element: `#${formId}`,
      amount,
      currency: "SAR",
      description,
      publishable_api_key: MOYASAR_KEY,
      callback_url: callbackUrl,
      methods,
      on_failure: (error: unknown) => {
        console.error("Moyasar payment failure:", error);
      },
    };

    // Add Apple Pay config only if supported
    if (applePaySupported()) {
      config.apple_pay = {
        country: "SA",
        label: planName,
        validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
      };
    }

    try {
      window.Moyasar.init(config);
    } catch (err) {
      console.error("Moyasar init error:", err);
      setStatus("error");
      setErrorMsg("حدث خطأ أثناء تهيئة بوابة الدفع.");
    }
  }, [status, amount, description, planKey, billing, planName, formId]);

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
          <div style={{ width: 32, height: 32, border: `3px solid ${R.border}`, borderTopColor: accentColor, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
          جاري تحميل بوابة الدفع...
        </div>
      )}

      <div id={formId} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        #${formId} input, #${formId} select {
          font-family: 'Cairo', 'Inter', sans-serif !important;
          border-radius: 10px !important;
          border: 1.5px solid ${R.border} !important;
          background: ${R.bg} !important;
          font-size: 14px !important;
          padding: 10px 12px !important;
        }
        #${formId} input:focus, #${formId} select:focus {
          border-color: ${accentColor} !important;
          outline: none !important;
          box-shadow: 0 0 0 3px ${accentLight} !important;
        }
        #${formId} button[type="submit"] {
          background: ${accentColor} !important;
          border-radius: 10px !important;
          font-family: 'Cairo', 'Inter', sans-serif !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          padding: 12px !important;
          width: 100% !important;
          border: none !important;
          color: white !important;
          cursor: pointer !important;
          margin-top: 8px !important;
        }
        #${formId} button[type="submit"]:hover {
          opacity: 0.9 !important;
        }
        #${formId} label {
          font-family: 'Cairo', 'Inter', sans-serif !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: ${R.text} !important;
        }
        #${formId} .mysr-method-tab {
          border-radius: 10px !important;
          border: 1.5px solid ${R.border} !important;
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
  const { plan: planKey, billing } = getParams();
  const planInfo = PLANS[planKey] ?? PLANS.pro;
  const isYearly = billing === "yearly";
  const amountSar = isYearly ? planInfo.yearlySar : planInfo.monthlySar;
  const amountHalala = amountSar * 100;

  const accentColor = planKey === "unlimited" ? R.purple : R.orange;
  const accentLight = planKey === "unlimited" ? R.purpleLight : R.orangeLight;

  // Key changes whenever plan or billing changes → forces MoyasarForm to remount
  const formKey = `${planKey}-${billing}`;

  return (
    <div style={{ minHeight: "100dvh", background: R.bg, fontFamily: "'Cairo', 'Inter', sans-serif", direction: "rtl" }}>

      {/* Navbar */}
      <header style={{ height: 60, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${R.border}`, background: R.bg }}>
        <Link href={`${base}/`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10B981", fontWeight: 600 }}>
          <Lock size={13} />
          دفع آمن ومشفّر
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "1fr 380px", gap: 32, alignItems: "start" }}>

        {/* Left — Order summary */}
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: R.text, marginBottom: 6 }}>
            إتمام الاشتراك
          </h1>
          <p style={{ fontSize: 14, color: R.muted, marginBottom: 32 }}>
            {planInfo.nameAr} — اشتراك {isYearly ? "سنوي (وفّر شهرين)" : "شهري"} · يُلغى في أي وقت.
          </p>

          {/* Billing toggle */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, background: R.bgChip, borderRadius: 99, padding: 3, marginBottom: 24 }}>
            <Link
              href={`${base}/checkout?plan=${planKey}&billing=monthly`}
              style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 99, textDecoration: "none",
                background: !isYearly ? R.bgCard : "transparent",
                color: !isYearly ? R.text : R.muted,
                boxShadow: !isYearly ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}
            >شهري</Link>
            <Link
              href={`${base}/checkout?plan=${planKey}&billing=yearly`}
              style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 99, textDecoration: "none",
                background: isYearly ? R.bgCard : "transparent",
                color: isYearly ? R.text : R.muted,
                boxShadow: isYearly ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                display: "flex", alignItems: "center", gap: 5 }}
            >
              سنوي
              <span style={{ fontSize: 9, background: "#10B981", color: "#fff", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>وفّر 17%</span>
            </Link>
          </div>

          {/* Plan toggle */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {Object.entries(PLANS).map(([key, p]) => (
              <Link
                key={key}
                href={`${base}/checkout?plan=${key}&billing=${billing}`}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 10, textDecoration: "none",
                  background: planKey === key ? p.color : "transparent",
                  color: planKey === key ? "#fff" : R.muted,
                  border: `1.5px solid ${planKey === key ? p.color : R.border}`,
                  transition: "all 0.15s" }}
              >
                {p.label}
              </Link>
            ))}
          </div>

          {/* Order box */}
          <div style={{ background: R.bgCard, border: `2px solid ${accentColor}`, borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: `0 0 0 4px ${accentLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: `1px solid ${R.border}` }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: R.text }}>{planInfo.nameAr}</p>
                <p style={{ fontSize: 13, color: R.muted, marginTop: 2 }}>اشتراك {isYearly ? "سنوي" : "شهري"}</p>
              </div>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: R.text }}>{amountSar} ر.س</p>
                <p style={{ fontSize: 12, color: R.muted }}>/{isYearly ? "سنة" : "شهر"}</p>
              </div>
            </div>

            {isYearly && (
              <div style={{ margin: "12px 0 0", padding: "8px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 12, color: "#166534", fontWeight: 600 }}>
                🎉 وفّرت {planInfo.monthlySar * 2} ر.س (شهرين مجاناً)
              </div>
            )}

            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: accentLight, borderRadius: 8 }}>
              <Coins size={14} color={accentColor} />
              <span style={{ fontSize: 12, color: R.text, fontWeight: 600 }}>{planInfo.tokens}</span>
            </div>

            <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
              {planInfo.features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: R.text }}>
                  <span style={{ width: 17, height: 17, borderRadius: 99, background: accentColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Trust badges */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { icon: <Shield size={14} />, text: "مدفوعات مشفّرة بـ SSL" },
              { icon: <Lock size={14} />, text: "لا نخزن بيانات بطاقتك" },
              { icon: <ArrowRight size={14} />, text: "إلغاء فوري بدون رسوم" },
            ].map(b => (
              <div key={b.text} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: R.muted }}>
                {b.icon} {b.text}
              </div>
            ))}
          </div>
        </div>

        {/* Right — Payment form */}
        <div>
          <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: R.text, marginBottom: 16 }}>بيانات الدفع</p>

            {/* key forces full remount when plan or billing changes */}
            <MoyasarForm
              key={formKey}
              amount={amountHalala}
              description={`${planInfo.nameAr} — اشتراك ${isYearly ? "سنوي" : "شهري"}`}
              planKey={planKey}
              billing={billing}
              planName={planInfo.nameAr}
              accentColor={accentColor}
              accentLight={accentLight}
            />

            {/* Apple Pay notice — only shown if NOT supported */}
            {!applePaySupported() && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "#FEF9EC", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 11, color: "#92400E" }}>
                💡 Apple Pay متاح فقط على Safari من أجهزة Apple
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${R.border}` }}>
              <p style={{ fontSize: 11, color: R.muted, marginBottom: 10, textAlign: "center" }}>وسائل الدفع المقبولة</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {["مدى", "Visa", "Mastercard", "Apple Pay", "STC Pay"].map(m => (
                  <span key={m} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", background: R.bgChip, border: `1px solid ${R.border}`, borderRadius: 6, color: R.text }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 14 }}>
            <a href="https://moyasar.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: R.muted, textDecoration: "none" }}>
              مدعوم بـ <span style={{ fontWeight: 700 }}>ميسر</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
