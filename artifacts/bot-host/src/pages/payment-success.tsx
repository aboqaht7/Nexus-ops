import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@clerk/react";
import { useTranslation } from "react-i18next";

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

interface SubByPaymentResp {
  activated?: boolean;
  subscription?: { plan: string; billing: string };
  error?: string;
}

interface ActivateResp {
  success?: boolean;
  error?: string;
}

const POLL_DELAYS_MS = [800, 1200, 1800, 2500, 3500]; // ~10s total

export default function PaymentSuccess() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const [location] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
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
          ? (decodeURIComponent(moyasarMessage) || t("paymentSuccess.failedFromMoyasar"))
          : t("paymentSuccess.failedDefault"),
      );
      return;
    }

    const auth = (token: string | null) => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    void (async () => {
      const token = await getToken();

      // 1) Poll the lookup endpoint — webhook may already have activated.
      for (let i = 0; i < POLL_DELAYS_MS.length; i++) {
        try {
          const r = await fetch(`${apiBase}/subscriptions/by-payment/${encodeURIComponent(paymentId)}`, {
            headers: auth(token),
          });
          if (r.ok) {
            const data = await r.json() as SubByPaymentResp;
            if (data.activated) {
              setStatus("success");
              setMessage(t("paymentSuccess.successMsg"));
              return;
            }
          }
        } catch {
          /* ignore — try fallback below */
        }
        setProgress(Math.round(((i + 1) / (POLL_DELAYS_MS.length + 1)) * 100));
        await new Promise<void>((res) => { setTimeout(res, POLL_DELAYS_MS[i]); });
      }

      // 2) Fallback: client-initiated activation (will verify via Moyasar API server-side)
      try {
        const r = await fetch(`${apiBase}/subscriptions/activate`, {
          method: "POST",
          headers: auth(token),
          body: JSON.stringify({ paymentId, plan, billing }),
        });
        const data = await r.json() as ActivateResp;
        if (r.ok && data.success) {
          setStatus("success");
          setMessage(t("paymentSuccess.successMsg"));
        } else {
          setStatus("failed");
          setMessage(data.error ?? t("paymentSuccess.failedDefault"));
        }
      } catch {
        setStatus("failed");
        setMessage(t("paymentSuccess.failedDefault"));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <div style={{ minHeight: "100dvh", background: R.bg, fontFamily: "'Cairo', 'Inter', sans-serif", direction: isRtl ? "rtl" : "ltr", display: "flex", flexDirection: "column" }}>
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
        <div style={{ background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 20, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", animation: "ps-fade-up 0.4s ease" }}>

          {status === "loading" && (
            <>
              <Loader2 size={48} style={{ color: R.orange, margin: "0 auto 20px", animation: "ps-spin 0.9s linear infinite" }} />
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: R.text, marginBottom: 8 }}>{t("paymentSuccess.loadingTitle")}</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>{t("paymentSuccess.loadingSubtitle")}</p>
              <div style={{ width: "100%", height: 4, background: R.border, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: R.orange, borderRadius: 99, transition: "width 0.4s ease" }} />
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#ECFDF5", border: "2px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", animation: "ps-pop 0.45s cubic-bezier(.34,1.56,.64,1)" }}>
                <CheckCircle size={42} color="#10B981" />
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, color: R.text, marginBottom: 12 }}>{t("paymentSuccess.successTitle")}</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>{message}</p>
              <Link href={`${base}/dashboard`} style={{ display: "inline-block", padding: "14px 40px", background: R.orange, color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 700, textDecoration: "none", boxShadow: `0 4px 14px ${R.orange}50`, transition: "transform 0.15s ease, box-shadow 0.18s ease" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 8px 20px ${R.orange}66`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 4px 14px ${R.orange}50`; }}>
                {t("paymentSuccess.goDashboard")}
              </Link>
            </>
          )}

          {status === "failed" && (
            <>
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#FEF2F2", border: "2px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", animation: "ps-pop 0.45s cubic-bezier(.34,1.56,.64,1)" }}>
                <XCircle size={42} color="#EF4444" />
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: R.text, marginBottom: 12 }}>{t("paymentSuccess.failedTitle")}</h1>
              <p style={{ color: R.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>{message}</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href={`${base}/pricing`} style={{ display: "inline-block", padding: "12px 28px", background: R.orange, color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                  {t("paymentSuccess.retry")}
                </Link>
                <a href="mailto:support@nexusops.app" style={{ display: "inline-block", padding: "12px 28px", background: "transparent", color: R.muted, border: `1.5px solid ${R.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                  {t("paymentSuccess.contactSupport")}
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ps-spin { to { transform: rotate(360deg); } }
        @keyframes ps-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ps-pop { 0% { opacity: 0; transform: scale(0.6); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
