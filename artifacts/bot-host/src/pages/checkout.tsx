import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Shield, Lock } from "lucide-react";

declare global {
  interface Window {
    Moyasar: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const MOYASAR_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string;

const R = {
  bg: "#FAF7F2",
  bgCard: "#FFFFFF",
  bgChip: "#F0EAE3",
  text: "#0D0D0D",
  muted: "#6B6B6B",
  border: "#E8DDD5",
  orange: "#F26207",
  orangeLight: "#FEF3EC",
};

export default function Checkout() {
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  /* Load Moyasar SDK dynamically */
  useEffect(() => {
    if (document.getElementById("moyasar-css")) {
      setSdkReady(!!window.Moyasar);
    } else {
      const link = document.createElement("link");
      link.id = "moyasar-css";
      link.rel = "stylesheet";
      link.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
      document.head.appendChild(link);
    }

    if (document.getElementById("moyasar-js")) {
      if (window.Moyasar) setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "moyasar-js";
    script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError("تعذّر تحميل بوابة ميسر. تحقق من اتصالك بالإنترنت.");
    document.head.appendChild(script);
  }, []);

  /* Init Moyasar form once SDK is ready */
  useEffect(() => {
    if (!sdkReady || initialized.current) return;
    if (!window.Moyasar) return;
    if (!MOYASAR_KEY) {
      setError("مفتاح ميسر غير مضبوط — يرجى إضافة VITE_MOYASAR_PUBLISHABLE_KEY في الإعدادات.");
      return;
    }

    initialized.current = true;

    window.Moyasar.init({
      element: ".mysr-form",
      amount: 3700,           /* 37 ريال = 3700 هللة */
      currency: "SAR",
      description: "NexusOps Pro — اشتراك شهري",
      publishable_api_key: MOYASAR_KEY,
      callback_url: `${window.location.origin}${base}/payment-success`,
      methods: ["creditcard", "applepay", "stcpay"],
      apple_pay: {
        country: "SA",
        label: "NexusOps Pro",
        validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
      },
    });
  }, [sdkReady]);

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
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "1fr 380px", gap: 32, alignItems: "start" }}>

        {/* Left — Order summary */}
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: R.text, marginBottom: 6 }}>
            إتمام الاشتراك
          </h1>
          <p style={{ fontSize: 14, color: R.muted, marginBottom: 32 }}>
            اشتراك NexusOps Pro — يُجدَّد شهرياً، يُلغى في أي وقت.
          </p>

          {/* Order box */}
          <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: `1px solid ${R.border}` }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: R.text }}>NexusOps Pro</p>
                <p style={{ fontSize: 13, color: R.muted, marginTop: 2 }}>اشتراك شهري</p>
              </div>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: R.text }}>37 ر.س</p>
                <p style={{ fontSize: 12, color: R.muted }}>/شهر</p>
              </div>
            </div>

            {/* Features recap */}
            <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "جميع مميزات الخطة المجانية",
                "أولوية في الموارد وبدون انقطاع",
                "نسخ احتياطي تلقائي يومي",
                "دعم مباشر عبر Discord",
                "مزامنة GitHub وAgent-4 AI",
                "إزالة شعار NexusOps",
              ].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: R.text }}>
                  <span style={{ width: 17, height: 17, borderRadius: 99, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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

        {/* Right — Moyasar form */}
        <div>
          <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: R.text, marginBottom: 16 }}>بيانات الدفع</p>

            {error ? (
              <div style={{ padding: 16, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, color: "#DC2626", fontSize: 13, lineHeight: 1.6 }}>
                {error}
              </div>
            ) : !sdkReady ? (
              <div style={{ padding: 32, textAlign: "center", color: R.muted, fontSize: 14 }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${R.border}`, borderTopColor: R.orange, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
                جاري تحميل بوابة الدفع...
              </div>
            ) : null}

            {/* Moyasar mounts here */}
            <div className="mysr-form" />

            {/* Payment logos */}
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

          {/* Moyasar branding */}
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <a href="https://moyasar.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: R.muted, textDecoration: "none" }}>
              مدعوم بـ <span style={{ fontWeight: 700 }}>ميسر</span>
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .mysr-form input, .mysr-form select {
          font-family: 'Cairo', 'Inter', sans-serif !important;
          border-radius: 10px !important;
          border: 1.5px solid ${R.border} !important;
          background: ${R.bg} !important;
          font-size: 14px !important;
          padding: 10px 12px !important;
        }
        .mysr-form input:focus, .mysr-form select:focus {
          border-color: ${R.orange} !important;
          outline: none !important;
          box-shadow: 0 0 0 3px ${R.orangeLight} !important;
        }
        .mysr-form button[type="submit"] {
          background: ${R.orange} !important;
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
        .mysr-form button[type="submit"]:hover {
          background: #D95600 !important;
        }
        .mysr-form label {
          font-family: 'Cairo', 'Inter', sans-serif !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: ${R.text} !important;
        }
        .mysr-form .mysr-method-tab {
          border-radius: 10px !important;
          border: 1.5px solid ${R.border} !important;
        }
        .mysr-form .mysr-method-tab.active {
          border-color: ${R.orange} !important;
          background: ${R.orangeLight} !important;
        }
      `}</style>
    </div>
  );
}
