import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    setLines([{ type: "stdout", text: `Installing "${pkg.trim()}" with ${manager}...` }]);

    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    const resp = await fetch(`${BASE}/api/bots/${botId}/packages/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: pkg.trim(), manager }),
      signal: ctrl.signal,
    }).catch(() => null);

    if (!resp || !resp.body) {
      setLines((p) => [...p, { type: "error", text: "Connection failed" }]);
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
          setLines((p) => [...p, msg]);
          if (msg.type === "done") {
            const ok = msg.text.includes("code 0");
            setLastStatus(ok ? "ok" : "fail");
          }
        } catch {}
      }
    }

    setInstalling(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e]">
      {/* Install bar */}
      <div className="flex gap-2 p-3 border-b border-white/5 flex-shrink-0">
        <div className="flex-1 relative">
          <PackageSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && install()}
            placeholder={manager === "npm" ? "discord.js, axios, dayjs…" : "discord.py, requests…"}
            className="h-7 text-xs pl-8 bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-primary/30"
          />
        </div>
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1.5 shrink-0"
          onClick={install}
          disabled={installing || !pkg.trim()}
        >
          {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TerminalSquare className="w-3.5 h-3.5" />}
          {installing ? "Installing…" : `Install via ${manager}`}
        </Button>
      </div>

      {/* Output */}
      <ScrollArea className="flex-1">
        <div className="p-3 font-mono text-xs space-y-0.5">
          {lines.length === 0 && (
            <p className="text-zinc-600 py-6 text-center text-[11px]">
              Enter a package name to install it.
            </p>
          )}
          {lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "leading-5 whitespace-pre-wrap break-all",
                l.type === "stderr" && "text-amber-400/80",
                l.type === "error" && "text-red-400",
                l.type === "done" && "text-zinc-500",
                l.type === "stdout" && "text-zinc-300"
              )}
            >
              {l.text}
            </div>
          ))}
          {lastStatus === "ok" && (
            <div className="flex items-center gap-1.5 text-emerald-400 mt-1 pt-1 border-t border-white/5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Installed successfully. Restart bot to use it.</span>
            </div>
          )}
          {lastStatus === "fail" && (
            <div className="flex items-center gap-1.5 text-red-400 mt-1 pt-1 border-t border-white/5">
              <XCircle className="w-3.5 h-3.5" />
              <span>Installation failed.</span>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
