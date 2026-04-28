import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@clerk/react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = `${base}/api`;

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
  const { getToken } = useAuth();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const moyasarStatus = params.get("status");
    const moyasarMessage = params.get("message") ?? "";
    const paymentId = params.get("id") ?? "";
    const plan = params.get("plan") ?? "";
    const billing = params.get("billing") ?? "";

    if (moyasarStatus !== "paid" || !paymentId || !plan || !billing) {
      setStatus("failed");
      setMessage(
        moyasarStatus === "failed"
          ? decodeURIComponent(moyasarMessage) || "فشلت عملية الدفع. حاول مرة أخرى."
          : "لم نتمكن من التحقق من حالة الدفع. تواصل مع الدعم."
      );
      return;
    }

    // Activate subscription on backend
    getToken().then(async (token) => {
      try {
        const resp = await fetch(`${apiBase}/subscriptions/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ paymentId, plan, billing }),
        });

        if (resp.ok) {
          setStatus("success");
          setMessage("تم استلام دفعتك وتفعيل اشتراكك بنجاح! 🎉");
        } else {
          const data = await resp.json() as { error?: string };
          setStatus("failed");
          setMessage(data.error ?? "فشل التحقق من الدفع. تواصل مع الدعم.");
        }
      } catch {
        setStatus("failed");
        setMessage("حدث خطأ في التواصل مع الخادم. تواصل مع الدعم.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <div style={{ minHeight: "100dvh", background: R.bg, fontFamily: "'Cairo', 'Inter', sans-serif", direction: "rtl", display: "flex", flexDirection: "column" }}>
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

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 20, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

          {status === "loading" && (
            <>
              <Loader2 size={48} style={{ color: R.orange, margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: R.text, marginBottom: 8 }}>جاري تفعيل اشتراكك...</h1>
              <p style={{ color: R.muted, fontSize: 14 }}>نتحقق من الدفع ونفعّل حسابك.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#ECFDF5", border: "2px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <CheckCircle size={40} color="#10B981" />
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: R.text, marginBottom: 12 }}>تم تفعيل الاشتراك!</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>{message}</p>
              <Link href={`${base}/dashboard`} style={{ display: "inline-block", padding: "14px 40px", background: R.orange, color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                الانتقال للوحة التحكم
              </Link>
            </>
          )}

          {status === "failed" && (
            <>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#FEF2F2", border: "2px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <XCircle size={40} color="#EF4444" />
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: R.text, marginBottom: 12 }}>مشكلة في التفعيل</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>{message}</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <Link href={`${base}/checkout`} style={{ display: "inline-block", padding: "12px 28px", background: R.orange, color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                  إعادة المحاولة
                </Link>
                <a href="mailto:support@nexusops.app" style={{ display: "inline-block", padding: "12px 28px", background: "transparent", color: R.muted, border: `1.5px solid ${R.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                  تواصل مع الدعم
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
