import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

const R = {
  bg: "#FAF7F2",
  bgCard: "#FFFFFF",
  text: "#0D0D0D",
  muted: "#6B6B6B",
  border: "#E8DDD5",
  orange: "#F26207",
  orangeLight: "#FEF3EC",
};

export default function PaymentSuccess() {
  const [location] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moyasarStatus = params.get("status");
    const moyasarMessage = params.get("message") ?? "";

    if (moyasarStatus === "paid") {
      setStatus("success");
      setMessage("تم استلام دفعتك بنجاح! حسابك سيُفعَّل خلال دقائق.");
    } else if (moyasarStatus === "failed") {
      setStatus("failed");
      setMessage(decodeURIComponent(moyasarMessage) || "فشلت عملية الدفع. حاول مرة أخرى أو تواصل مع الدعم.");
    } else {
      setStatus("failed");
      setMessage("لم نتمكن من التحقق من حالة الدفع. تواصل مع الدعم.");
    }
  }, [location]);

  return (
    <div style={{ minHeight: "100dvh", background: R.bg, fontFamily: "'Cairo', 'Inter', sans-serif", direction: "rtl", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <header style={{ height: 60, padding: "0 24px", display: "flex", alignItems: "center", borderBottom: `1px solid ${R.border}` }}>
        <Link href={`${base}/`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
              <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
              <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: R.text }}>Nexus<span style={{ color: R.orange }}>Ops</span></span>
        </Link>
      </header>

      {/* Center content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 20, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

          {status === "loading" && (
            <>
              <Loader2 size={48} style={{ color: R.orange, margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: R.text, marginBottom: 8 }}>جاري التحقق...</h1>
              <p style={{ color: R.muted, fontSize: 14 }}>نتحقق من حالة دفعتك.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#ECFDF5", border: "2px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <CheckCircle size={36} color="#10B981" />
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: R.text, marginBottom: 12 }}>تم الدفع بنجاح!</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>{message}</p>
              <Link href={`${base}/dashboard`} style={{ display: "inline-block", padding: "12px 32px", background: R.orange, color: "#fff", borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                الانتقال للوحة التحكم
              </Link>
            </>
          )}

          {status === "failed" && (
            <>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#FEF2F2", border: "2px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <XCircle size={36} color="#EF4444" />
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: R.text, marginBottom: 12 }}>فشل الدفع</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>{message}</p>
              <Link href={`${base}/checkout`} style={{ display: "inline-block", padding: "12px 32px", background: R.orange, color: "#fff", borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                إعادة المحاولة
              </Link>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
