import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PackageSearch, Loader2, CheckCircle2, XCircle, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogLine {
  type: "stdout" | "stderr" | "error" | "done";
  text: string;
}

interface PackagesPanelProps {
  botId: string;
  language: "javascript" | "python";
}

export function PackagesPanel({ botId, language }: PackagesPanelProps) {
  const [pkg, setPkg] = useState("");
  const [installing, setInstalling] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [lastStatus, setLastStatus] = useState<"ok" | "fail" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const manager = language === "python" ? "pip" : "npm";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const install = async () => {
    if (!pkg.trim() || installing) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setInstalling(true);
    setLastStatus(null);
    setLines([{ type: "stdout", text: `جاري تثبيت "${pkg.trim()}" عبر ${manager}...` }]);

    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    const resp = await fetch(`${BASE}/api/bots/${botId}/packages/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: pkg.trim(), manager }),
      signal: ctrl.signal,
    }).catch(() => null);

    if (!resp || !resp.body) {
      setLines(p => [...p, { type: "error", text: "فشل الاتصال بالخادم" }]);
      setInstalling(false);
      setLastStatus("fail");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part.replace(/^data: /, "").trim();
        if (!dataLine) continue;
        try {
          const msg: LogLine = JSON.parse(dataLine);
          setLines(p => [...p, msg]);
          if (msg.type === "done") {
            setLastStatus(msg.text.includes("code 0") ? "ok" : "fail");
          }
        } catch {}
      }
    }

    setInstalling(false);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#010409" }}>
      {/* شريط التثبيت */}
      <div style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid #30363D", flexShrink: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <PackageSearch style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#484F58" }} />
          <input
            value={pkg}
            onChange={e => setPkg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && install()}
            placeholder={manager === "npm" ? "discord.js, axios, dayjs…" : "discord.py, requests…"}
            style={{ width: "100%", height: 30, fontSize: 12, fontFamily: "'JetBrains Mono','Cairo',monospace", background: "#161B22", border: "1px solid #30363D", borderRadius: 6, padding: "0 34px 0 10px", color: "#E6EDF3", outline: "none", boxSizing: "border-box" }}
            onFocus={e => (e.currentTarget.style.borderColor = "#F26207")}
            onBlur={e => (e.currentTarget.style.borderColor = "#30363D")}
          />
        </div>
        <button
          onClick={install}
          disabled={installing || !pkg.trim()}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 12px", height: 30, fontSize: 12, fontWeight: 600, fontFamily: "'Cairo','Inter',sans-serif", borderRadius: 6, border: "none", background: installing || !pkg.trim() ? "#21262D" : "#F26207", color: installing || !pkg.trim() ? "#484F58" : "#fff", cursor: installing || !pkg.trim() ? "not-allowed" : "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {installing ? <Loader2 style={{ width: 12, height: 12, animation: "spin .8s linear infinite" }} /> : <TerminalSquare style={{ width: 12, height: 12 }} />}
          {installing ? "جاري التثبيت…" : `تثبيت عبر ${manager}`}
        </button>
      </div>

      {/* مخرجات التثبيت */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {lines.length === 0 && (
          <p style={{ textAlign: "center", color: "#484F58", fontSize: 12, padding: "40px 0", fontFamily: "'JetBrains Mono',monospace" }}>
            اكتب اسم الحزمة لتثبيتها
          </p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: 12, fontFamily: "'JetBrains Mono',monospace", lineHeight: "20px",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              color: l.type === "stderr" ? "#D29922" : l.type === "error" ? "#F85149" : l.type === "done" ? "#484F58" : "#ABB2BF",
            }}
          >
            {l.text}
          </div>
        ))}
        {lastStatus === "ok" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#3FB950", marginTop: 8, paddingTop: 8, borderTop: "1px solid #21262D", fontSize: 12, fontFamily: "'Cairo','Inter',sans-serif" }}>
            <CheckCircle2 style={{ width: 13, height: 13 }} />
            تم التثبيت بنجاح. أعِد تشغيل البوت لتطبيق التغييرات.
          </div>
        )}
        {lastStatus === "fail" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#F85149", marginTop: 8, paddingTop: 8, borderTop: "1px solid #21262D", fontSize: 12, fontFamily: "'Cairo','Inter',sans-serif" }}>
            <XCircle style={{ width: 13, height: 13 }} />
            فشل التثبيت. تحقق من اسم الحزمة وحاول مجدداً.
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
