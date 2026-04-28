import { Link } from "wouter";
import { Check, Zap, Crown } from "lucide-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

const R = {
  bg: "#FAF7F2",
  bgCard: "#FFFFFF",
  bgChip: "#F0EAE3",
  text: "#0D0D0D",
  muted: "#6B6B6B",
  border: "#E8DDD5",
  orange: "#F26207",
  orangeHover: "#D95600",
  orangeLight: "#FEF3EC",
};

const freeFeatures = [
  "بوتات غير محدودة",
  "محرر Monaco (VS Code)",
  "سجلات مباشرة",
  "متغيرات البيئة (Secrets)",
  "دعم JavaScript و Python",
  "استضافة 24/7",
  "مدير الحزم npm/pip",
  "تيرمينال مدمج",
  "دعم المجتمع",
];

const proFeatures = [
  "كل مميزات المجانية",
  "أولوية في الموارد",
  "بوتات بدون انقطاع",
  "نسخ احتياطي تلقائي",
  "دعم فوري عبر Discord",
  "مزامنة GitHub",
  "Agent-4 AI للكتابة التلقائية",
  "إزالة شعار NexusOps",
  "إحصائيات متقدمة",
];

const faqs = [
  {
    q: "هل المجاني حقاً مجاني؟",
    a: "نعم، الخطة المجانية لا تحتاج بطاقة ائتمان وتشمل جميع المميزات الأساسية لتشغيل بوتاتك.",
  },
  {
    q: "ما طرق الدفع المقبولة؟",
    a: "نقبل جميع البطاقات الائتمانية (Visa، Mastercard، Amex)، Apple Pay، Google Pay، وPayPal.",
  },
  {
    q: "هل يمكنني الإلغاء في أي وقت؟",
    a: "نعم، يمكنك إلغاء اشتراكك في أي وقت وستبقى المميزات سارية حتى نهاية فترة الفوترة.",
  },
  {
    q: "ماذا يحدث لبوتاتي إذا ألغيت؟",
    a: "بوتاتك وأكوادك محفوظة، ستعود تلقائياً لمميزات الخطة المجانية.",
  },
];

export default function Pricing() {
  return (
    <div style={{ background: R.bg, color: R.text, fontFamily: "'Cairo', 'Inter', sans-serif", minHeight: "100dvh", direction: "rtl" }}>

      {/* Navbar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: `${R.bg}E6`, backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${R.border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href={`${base}/`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
                <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
                <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color: R.text }}>
              Nexus<span style={{ color: R.orange }}>Ops</span>
            </span>
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`${base}/sign-in`} style={{ padding: "7px 14px", fontSize: 14, fontWeight: 500, color: R.text, textDecoration: "none", borderRadius: 8 }}>
              تسجيل الدخول
            </Link>
            <Link href={`${base}/sign-up`} style={{ padding: "7px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: R.orange, textDecoration: "none", borderRadius: 99 }}>
              ابدأ مجاناً
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "70px 24px 50px" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(40px, 5vw, 60px)", fontWeight: 600, lineHeight: 1.1, color: R.text, marginBottom: 16 }}>
          الأسعار
        </h1>
        <p style={{ fontSize: 16, color: R.muted, maxWidth: 480, margin: "0 auto" }}>
          اختر الخطة المناسبة لك. لا رسوم خفية.
        </p>
      </section>

      {/* Plans */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 80px", display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>

        {/* Free */}
        <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 20, padding: 32, flex: "1 1 340px", maxWidth: 400 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: R.bgChip, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={18} color={R.orange} />
            </div>
            <div>
              <p style={{ fontSize: 13, color: R.muted, marginBottom: 2 }}>الخطة الأساسية</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: R.text, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>مجاني</p>
            </div>
          </div>
          <p style={{ fontSize: 13, color: R.muted, marginBottom: 24 }}>للبدء وتجربة المنصة</p>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
            {freeFeatures.map(f => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: R.text }}>
                <span style={{ width: 18, height: 18, borderRadius: 99, background: R.bgChip, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color={R.orange} strokeWidth={2.5} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <Link href={`${base}/sign-up`} style={{
            display: "block", textAlign: "center", padding: "12px 0",
            borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: "none",
            border: `1.5px solid ${R.border}`, color: R.text, background: "transparent",
          }}>
            إنشاء حساب مجاني
          </Link>
        </div>

        {/* Pro */}
        <div style={{
          background: R.bgCard, border: `2px solid ${R.orange}`,
          borderRadius: 20, padding: 32, flex: "1 1 340px", maxWidth: 400,
          boxShadow: `0 0 0 6px ${R.orangeLight}`,
          position: "relative",
        }}>
          {/* Badge */}
          <div style={{
            position: "absolute", top: -14, right: 28,
            background: R.orange, color: "#fff",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            padding: "4px 14px", borderRadius: 99,
          }}>
            الأكثر شيوعاً
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: R.orangeLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Crown size={18} color={R.orange} />
            </div>
            <div>
              <p style={{ fontSize: 13, color: R.muted, marginBottom: 2 }}>NexusOps Pro</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <p style={{ fontSize: 36, fontWeight: 700, color: R.text, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>$10</p>
                <span style={{ fontSize: 13, color: R.muted }}>/شهر</span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: R.muted, marginBottom: 24 }}>للمشاريع الجادة والبوتات المهمة</p>

          {/* Payment methods */}
          <div style={{ background: R.bgChip, borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: R.muted, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              طرق الدفع المقبولة
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay", "PayPal"].map(m => (
                <span key={m} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 8px",
                  background: R.bgCard, border: `1px solid ${R.border}`,
                  borderRadius: 6, color: R.text,
                }}>{m}</span>
              ))}
            </div>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
            {proFeatures.map(f => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: R.text }}>
                <span style={{ width: 18, height: 18, borderRadius: 99, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#fff" strokeWidth={2.5} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <Link
            href={`${base}/checkout`}
            style={{
              display: "block", textAlign: "center", padding: "13px 0",
              borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: "none",
              background: R.orange, color: "#fff",
            }}
          >
            اشترك الآن — 37 ر.س/شهر
          </Link>
          <p style={{ fontSize: 11, color: R.muted, textAlign: "center", marginTop: 10 }}>
            إلغاء في أي وقت · لا التزامات
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 80px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 600, textAlign: "center", marginBottom: 36 }}>
          أسئلة شائعة
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderTop: `1px solid ${R.border}`, padding: "20px 0" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: R.text, marginBottom: 8 }}>{faq.q}</p>
              <p style={{ fontSize: 14, color: R.muted, lineHeight: 1.7 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${R.border}`, padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: R.muted }}>© 2026 NexusOps — منصة استضافة بوتات Discord</p>
      </footer>
    </div>
  );
}
