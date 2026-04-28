import { useState } from "react";
import { Link } from "wouter";
import { Check, Zap, Crown, Infinity, Coins } from "lucide-react";

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

/* ─── Plans data ────────────────────────────────────────────────────── */

const plans = [
  {
    key: "free",
    icon: <Zap size={18} color={R.orange} />,
    iconBg: R.bgChip,
    label: "الخطة المجانية",
    nameAr: "مجاني",
    monthlyPrice: null,
    yearlyPrice: null,
    sub: "للتجربة والبدء",
    tokens: "50 توكن / شهر",
    highlight: false,
    badge: null,
    features: [
      "بوت واحد فقط",
      "50 توكن Agent-4 شهرياً",
      "محرر Monaco (VS Code)",
      "سجلات مباشرة",
      "متغيرات البيئة (Secrets)",
      "دعم JavaScript و Python",
      "مدير الحزم npm/pip",
      "دعم المجتمع",
    ],
    disabledFeatures: [
      "بدون انقطاع 24/7",
      "نسخ احتياطي تلقائي",
      "مزامنة GitHub",
      "إزالة شعار NexusOps",
    ],
    cta: "إنشاء حساب مجاني",
    ctaHref: `${base}/sign-up`,
    ctaStyle: "outline",
    queryParam: "",
  },
  {
    key: "pro",
    icon: <Crown size={18} color={R.orange} />,
    iconBg: R.orangeLight,
    label: "NexusOps Pro",
    nameAr: "برو",
    monthlyPrice: { sar: 37, label: "37 ر.س" },
    yearlyPrice: { sar: 370, label: "370 ر.س", perMonth: "31 ر.س" },
    sub: "للمشاريع الجادة",
    tokens: "500 توكن / شهر",
    highlight: true,
    badge: "الأكثر شيوعاً",
    features: [
      "حتى 5 بوتات",
      "500 توكن Agent-4 شهرياً",
      "بوتات بدون انقطاع 24/7",
      "أولوية في الموارد",
      "نسخ احتياطي تلقائي يومي",
      "مزامنة GitHub",
      "دعم فوري عبر Discord",
      "إزالة شعار NexusOps",
      "إحصائيات متقدمة",
    ],
    disabledFeatures: [],
    cta: "اشترك في Pro",
    ctaHref: `${base}/checkout`,
    ctaStyle: "primary",
    queryParam: "pro",
  },
  {
    key: "unlimited",
    icon: <Infinity size={18} color="#7C3AED" />,
    iconBg: "#F5F3FF",
    label: "NexusOps Unlimited",
    nameAr: "لا محدود",
    monthlyPrice: { sar: 75, label: "75 ر.س" },
    yearlyPrice: { sar: 750, label: "750 ر.س", perMonth: "63 ر.س" },
    sub: "كل شيء بلا حدود",
    tokens: "توكنات غير محدودة",
    highlight: false,
    badge: "الأفضل قيمة",
    badgeColor: "#7C3AED",
    features: [
      "بوتات غير محدودة",
      "توكنات Agent-4 غير محدودة",
      "كل مميزات Pro",
      "موارد حصرية مضاعفة",
      "دعم أولوية قصوى (SLA)",
      "API مخصص",
      "لوحة تحكم مؤسسية",
      "بيئات متعددة (Dev/Prod)",
      "تقارير استخدام مفصّلة",
    ],
    disabledFeatures: [],
    cta: "اشترك في Unlimited",
    ctaHref: `${base}/checkout`,
    ctaStyle: "purple",
    queryParam: "unlimited",
  },
];

const faqs = [
  {
    q: "ما هي التوكنات؟",
    a: "التوكنات هي وحدة استخدام مساعد Agent-4 الذكي. كل طلب يستهلك عدداً من التوكنات بحسب التعقيد. تتجدد شهرياً تلقائياً.",
  },
  {
    q: "هل المجاني حقاً مجاني؟",
    a: "نعم، لا تحتاج بطاقة ائتمان. الخطة المجانية تتيح لك تشغيل بوت واحد مع محرر Monaco الكامل وسجلات مباشرة.",
  },
  {
    q: "ما وفر الاشتراك السنوي؟",
    a: "الاشتراك السنوي يعادل 10 أشهر بسعر 12 شهراً — أي شهرين مجاناً تماماً.",
  },
  {
    q: "ما طرق الدفع المقبولة؟",
    a: "مدى، Visa، Mastercard، Apple Pay، وSTC Pay — جميعها مدعومة عبر بوابة ميسر الآمنة.",
  },
  {
    q: "هل يمكنني الترقية أو التخفيض في أي وقت؟",
    a: "نعم، تستطيع تغيير خطتك في أي وقت. عند الترقية، يُحسب الفرق تناسبياً.",
  },
  {
    q: "ماذا يحدث لبوتاتي إذا ألغيت الاشتراك؟",
    a: "بوتاتك وأكوادك محفوظة دائماً. ستعود لمميزات الخطة المجانية (بوت واحد فعّال).",
  },
];

/* ─── Component ─────────────────────────────────────────────────────── */

export default function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

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
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(40px, 5vw, 60px)", fontWeight: 600, lineHeight: 1.1, color: R.text, marginBottom: 14 }}>
          الأسعار
        </h1>
        <p style={{ fontSize: 16, color: R.muted, maxWidth: 500, margin: "0 auto 32px" }}>
          ابدأ مجاناً. طوّر بلا حدود. لا رسوم خفية.
        </p>

        {/* Billing toggle */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 0, background: R.bgChip, borderRadius: 99, padding: 4 }}>
          <button
            onClick={() => setBilling("monthly")}
            style={{
              padding: "7px 20px", fontSize: 13, fontWeight: 600, borderRadius: 99, border: "none", cursor: "pointer",
              background: billing === "monthly" ? R.bgCard : "transparent",
              color: billing === "monthly" ? R.text : R.muted,
              boxShadow: billing === "monthly" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s",
            }}
          >
            شهري
          </button>
          <button
            onClick={() => setBilling("yearly")}
            style={{
              padding: "7px 20px", fontSize: 13, fontWeight: 600, borderRadius: 99, border: "none", cursor: "pointer",
              background: billing === "yearly" ? R.bgCard : "transparent",
              color: billing === "yearly" ? R.text : R.muted,
              boxShadow: billing === "yearly" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            سنوي
            <span style={{ fontSize: 10, fontWeight: 700, background: "#10B981", color: "#fff", padding: "1px 7px", borderRadius: 99 }}>
              شهران مجاناً
            </span>
          </button>
        </div>
      </section>

      {/* Token system note */}
      <div style={{ maxWidth: 860, margin: "0 auto 36px", padding: "0 24px" }}>
        <div style={{ background: R.orangeLight, border: `1px solid ${R.border}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <Coins size={16} color={R.orange} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: R.text, margin: 0, lineHeight: 1.6 }}>
            <strong>نظام التوكنات:</strong> كل خطة تأتي بعدد توكنات لمساعد Agent-4 الذكي. التوكنات تتجدد تلقائياً كل شهر، وكل طلب يستهلك 1–10 توكنات حسب التعقيد.
          </p>
        </div>
      </div>

      {/* Plans */}
      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px 80px", display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
        {plans.map(p => {
          const priceObj = billing === "yearly" ? p.yearlyPrice : p.monthlyPrice;
          const borderColor = p.key === "unlimited" ? "#7C3AED" : p.highlight ? R.orange : R.border;
          const shadowColor = p.key === "unlimited" ? "#F5F3FF" : p.highlight ? R.orangeLight : "transparent";
          const badgeColor = p.key === "unlimited" ? "#7C3AED" : R.orange;

          return (
            <div
              key={p.key}
              style={{
                background: R.bgCard,
                border: `${p.highlight || p.key === "unlimited" ? 2 : 1}px solid ${borderColor}`,
                borderRadius: 20, padding: 28, flex: "1 1 300px", maxWidth: 330,
                boxShadow: (p.highlight || p.key === "unlimited") ? `0 0 0 5px ${shadowColor}` : "none",
                position: "relative",
              }}
            >
              {/* Badge */}
              {p.badge && (
                <div style={{
                  position: "absolute", top: -13, right: 24,
                  background: badgeColor, color: "#fff",
                  fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 99,
                }}>
                  {p.badge}
                </div>
              )}

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: p.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {p.icon}
                </div>
                <div>
                  <p style={{ fontSize: 12, color: R.muted, marginBottom: 2 }}>{p.label}</p>
                  {priceObj ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 30, fontWeight: 700, color: R.text, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>
                        {billing === "yearly" ? priceObj.perMonth : priceObj.label}
                      </span>
                      <span style={{ fontSize: 12, color: R.muted }}>/شهر</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 30, fontWeight: 700, color: R.text, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>مجاني</span>
                  )}
                </div>
              </div>

              {/* Yearly total */}
              {billing === "yearly" && priceObj && "sar" in priceObj && (
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "6px 10px", marginBottom: 14, fontSize: 12, color: "#166534", fontWeight: 600 }}>
                  يُدفع {(priceObj as {sar:number;label:string;perMonth:string}).label} سنوياً — وفّر شهرين 🎉
                </div>
              )}

              {/* Token chip */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: R.bgChip, borderRadius: 99, padding: "3px 10px", marginBottom: 16 }}>
                <Coins size={11} color={R.orange} />
                <span style={{ fontSize: 11, fontWeight: 600, color: R.text }}>{p.tokens}</span>
              </div>

              <p style={{ fontSize: 13, color: R.muted, marginBottom: 20 }}>{p.sub}</p>

              {/* Features */}
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                {p.features.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: R.text }}>
                    <span style={{ width: 17, height: 17, borderRadius: 99, background: p.key === "unlimited" ? "#7C3AED" : p.highlight ? R.orange : R.bgChip, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <Check size={10} color={p.highlight || p.key === "unlimited" ? "#fff" : R.orange} strokeWidth={2.5} />
                    </span>
                    {f}
                  </li>
                ))}
                {p.disabledFeatures.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: R.muted, opacity: 0.5 }}>
                    <span style={{ width: 17, height: 17, borderRadius: 99, background: R.bgChip, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <span style={{ width: 7, height: 1.5, background: R.muted, borderRadius: 99, display: "block" }} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <div style={{ height: 20 }} />

              {/* CTA */}
              <Link
                href={p.key === "free" ? p.ctaHref : `${p.ctaHref}?plan=${p.queryParam}&billing=${billing}`}
                style={{
                  display: "block", textAlign: "center", padding: "12px 0",
                  borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: "none",
                  background: p.key === "unlimited" ? "#7C3AED" : p.highlight ? R.orange : "transparent",
                  color: p.highlight || p.key === "unlimited" ? "#fff" : R.text,
                  border: p.key === "free" ? `1.5px solid ${R.border}` : "none",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {p.cta}
              </Link>

              {p.key !== "free" && (
                <p style={{ fontSize: 11, color: R.muted, textAlign: "center", marginTop: 8 }}>
                  إلغاء في أي وقت · بدون التزام
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* Token system explainer */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 60px" }}>
        <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 20, padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Coins size={20} color={R.orange} />
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: R.text, margin: 0 }}>
              نظام التوكنات — كيف يعمل؟
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
            {[
              { icon: "🤖", title: "Agent-4 AI", desc: "كل رسالة ترسلها لمساعد Agent-4 تستهلك توكنات. الطلبات البسيطة تستهلك 1–2 توكن، والمعقدة حتى 10." },
              { icon: "🔄", title: "تجديد شهري", desc: "تتجدد التوكنات تلقائياً في أول كل شهر. التوكنات غير المستخدمة لا تُرحَّل." },
              { icon: "📊", title: "رصيد واضح", desc: "تتبّع استخدامك من لوحة التحكم في أي وقت. تُرسل لك تنبيهات عند قرب النفاد." },
              { icon: "⚡", title: "ترقية فورية", desc: "نفدت توكناتك؟ رقّي خطتك فوراً من لوحة التحكم وتحصل على التوكنات الجديدة في الحال." },
            ].map(item => (
              <div key={item.title} style={{ padding: "16px", background: R.bg, borderRadius: 12, border: `1px solid ${R.border}` }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: R.text, marginBottom: 6 }}>{item.title}</p>
                <p style={{ fontSize: 13, color: R.muted, lineHeight: 1.65 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 80px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, textAlign: "center", marginBottom: 28, color: R.text }}>
          مقارنة الخطط
        </h2>
        <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: R.bgChip }}>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: R.text }}>الميزة</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: R.text }}>مجاني</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: R.orange }}>Pro</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: "#7C3AED" }}>Unlimited</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["عدد البوتات", "1", "5", "∞"],
                ["توكنات Agent-4", "50/شهر", "500/شهر", "∞"],
                ["محرر Monaco", "✓", "✓", "✓"],
                ["سجلات مباشرة", "✓", "✓", "✓"],
                ["متغيرات البيئة", "✓", "✓", "✓"],
                ["npm/pip", "✓", "✓", "✓"],
                ["24/7 بدون انقطاع", "—", "✓", "✓"],
                ["نسخ احتياطي تلقائي", "—", "✓", "✓"],
                ["مزامنة GitHub", "—", "✓", "✓"],
                ["إزالة شعار NexusOps", "—", "✓", "✓"],
                ["دعم أولوية", "—", "Discord", "SLA مضمون"],
                ["API مخصص", "—", "—", "✓"],
                ["بيئات Dev/Prod", "—", "—", "✓"],
              ].map(([feat, free, pro, unl], i) => (
                <tr key={feat} style={{ borderTop: `1px solid ${R.border}`, background: i % 2 === 0 ? "transparent" : R.bg }}>
                  <td style={{ padding: "11px 16px", color: R.text, fontWeight: 500 }}>{feat}</td>
                  <td style={{ padding: "11px 16px", textAlign: "center", color: free === "—" ? R.muted : "#10B981" }}>{free}</td>
                  <td style={{ padding: "11px 16px", textAlign: "center", color: pro === "—" ? R.muted : "#10B981" }}>{pro}</td>
                  <td style={{ padding: "11px 16px", textAlign: "center", color: unl === "—" ? R.muted : "#7C3AED", fontWeight: unl === "∞" ? 700 : 400 }}>{unl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 80px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 600, textAlign: "center", marginBottom: 36, color: R.text }}>
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
