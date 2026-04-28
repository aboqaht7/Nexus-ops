import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import Editor from "@monaco-editor/react";
import {
  useGetBot,
  useGetBotFile,
  useSaveBotFile,
  useGetBotEnv,
  useSetBotEnv,
  useStartBot,
  useStopBot,
  useRestartBot,
  getGetBotQueryKey,
  getGetBotFileQueryKey,
  getGetBotEnvQueryKey,
  getListBotsQueryKey,
  getGetBotsStatsQueryKey,
  BotStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalPanel } from "@/components/terminal-panel";
import { PackagesPanel } from "@/components/packages-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  Play,
  Square,
  RotateCw,
  Save,
  Terminal,
  KeyRound,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PackageSearch,
  Wifi,
  WifiOff,
  FileCode2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Replit dark editor palette ─────────────────────────────────── */
const E = {
  bg: "#0E1117",
  bgPanel: "#161B22",
  bgHeader: "#0D1117",
  bgRow: "#1C2128",
  bgInput: "#21262D",
  border: "#30363D",
  borderLight: "#21262D",
  text: "#E6EDF3",
  muted: "#8B949E",
  mutedDim: "#484F58",
  orange: "#F26207",
  orangeLight: "#3D1F00",
  green: "#3FB950",
  greenBg: "#0D1F0D",
  red: "#F85149",
  redBg: "#1F0D0D",
  amber: "#D29922",
  blue: "#58A6FF",
};

interface EnvRow { key: string; value: string; visible: boolean; }
interface LogLine { timestamp: string; level: "info" | "error"; message: string; }
type ActiveTab = "console" | "terminal" | "secrets" | "packages";

const STATUS_AR: Record<BotStatus, string> = {
  running: "يعمل",
  stopped: "متوقف",
  crashed: "تعطّل",
  starting: "يُشغَّل",
};
const STATUS_COLOR: Record<BotStatus, string> = {
  running: E.green,
  stopped: E.muted,
  crashed: E.red,
  starting: E.amber,
};

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function BotEditor() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [code, setCode] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("console");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const { data: bot, isLoading: botLoading } = useGetBot(id!, {
    query: { enabled: !!id, queryKey: getGetBotQueryKey(id!), refetchInterval: 3000 },
  });
  const { data: fileData, isLoading: fileLoading } = useGetBotFile(id!, {
    query: { enabled: !!id, queryKey: getGetBotFileQueryKey(id!) },
  });
  const { data: envData } = useGetBotEnv(id!, {
    query: { enabled: !!id, queryKey: getGetBotEnvQueryKey(id!) },
  });

  const saveFile = useSaveBotFile();
  const saveEnv = useSetBotEnv();
  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();

  useEffect(() => {
    if (fileData?.content !== undefined && !isDirty) setCode(fileData.content);
  }, [fileData?.content]);

  useEffect(() => {
    if (envData?.vars) setEnvRows(envData.vars.map(v => ({ key: v.key, value: v.value, visible: false })));
  }, [envData]);

  /* SSE log stream */
  useEffect(() => {
    if (!id) return;
    const url = `${base}/api/bots/${id}/logs/stream`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const entry: LogLine = JSON.parse(e.data);
        setLogs(prev => { const n = [...prev, entry]; return n.length > 500 ? n.slice(-500) : n; });
      } catch {}
    };
    return () => { es.close(); esRef.current = null; setSseConnected(false); };
  }, [id]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetBotQueryKey(id!) });
    qc.invalidateQueries({ queryKey: getListBotsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
  };

  const handleSaveFile = useCallback(async () => {
    if (!id) return;
    try {
      await saveFile.mutateAsync({ id, data: { content: code } });
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: getGetBotFileQueryKey(id) });
      toast({ title: "✓ تم الحفظ", description: "حُفظ الملف بنجاح." });
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" });
    }
  }, [id, code, saveFile, qc, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSaveFile(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSaveFile]);

  const handleAction = (action: any, label: string) => {
    action.mutate({ id: id! }, {
      onSuccess: () => { invalidate(); toast({ title: label }); },
      onError: (e: any) => { toast({ title: "خطأ", description: e.message, variant: "destructive" }); },
    });
  };

  const handleSaveEnv = async () => {
    if (!id) return;
    const vars = envRows.filter(r => r.key.trim()).map(({ key, value }) => ({ key: key.trim(), value }));
    try {
      await saveEnv.mutateAsync({ id, data: { vars } });
      qc.invalidateQueries({ queryKey: getGetBotEnvQueryKey(id) });
      toast({ title: "✓ تم حفظ الأسرار", description: "أعِد تشغيل البوت لتطبيق التغييرات." });
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" });
    }
  };

  const addEnvRow = () => setEnvRows(p => [...p, { key: "", value: "", visible: false }]);
  const removeEnvRow = (i: number) => setEnvRows(p => p.filter((_, idx) => idx !== i));
  const updateEnvRow = (i: number, f: "key" | "value", v: string) =>
    setEnvRows(p => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r));
  const toggleVisible = (i: number) =>
    setEnvRows(p => p.map((r, idx) => idx === i ? { ...r, visible: !r.visible } : r));

  const monacoLang = bot?.language === "python" ? "python" : "javascript";
  const isRunning = bot?.status === "running" || bot?.status === "starting";

  /* ── Loading ─────────────────────────────── */
  if (botLoading) {
    return (
      <div style={{ height: "100dvh", background: E.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 style={{ color: E.orange, animation: "spin 0.8s linear infinite", width: 28, height: 28 }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!bot) {
    return (
      <div style={{ height: "100dvh", background: E.bg, color: E.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Cairo','Inter',sans-serif" }}>
        <p style={{ color: E.muted }}>لم يُعثر على البوت.</p>
        <Link href={`${base}/dashboard`} style={{ color: E.orange, textDecoration: "none", fontSize: 14 }}>← العودة للوحة التحكم</Link>
      </div>
    );
  }

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: "console",  label: "وحدة التحكم", icon: <Terminal size={13} /> },
    { id: "terminal", label: "الطرفية",       icon: <Terminal size={13} /> },
    { id: "secrets",  label: "الأسرار",       icon: <KeyRound size={13} /> },
    { id: "packages", label: "الحزم",         icon: <PackageSearch size={13} /> },
  ];

  const statusColor = STATUS_COLOR[bot.status];

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: E.bg, color: E.text, fontFamily: "'Cairo','Inter','JetBrains Mono',sans-serif", overflow: "hidden" }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header style={{ height: 48, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", background: E.bgHeader, borderBottom: `1px solid ${E.border}`, flexShrink: 0, zIndex: 10 }}>

        {/* Back */}
        <Link href={`${base}/dashboard`} style={{ display: "flex", alignItems: "center", gap: 5, color: E.muted, textDecoration: "none", fontSize: 13, padding: "4px 8px", borderRadius: 6, transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = E.text; e.currentTarget.style.background = E.bgRow; }}
          onMouseLeave={e => { e.currentTarget.style.color = E.muted; e.currentTarget.style.background = "transparent"; }}>
          <ChevronLeft size={15} />
        </Link>

        {/* Bot name + file */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <FileCode2 size={15} style={{ color: E.orange, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: E.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {bot.name}
          </span>
          {bot.filename && (
            <span style={{ fontSize: 12, color: E.mutedDim, fontFamily: "'JetBrains Mono',monospace" }}>
              / {bot.filename}
            </span>
          )}
        </div>

        {/* Status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 99, background: E.bgRow, border: `1px solid ${E.border}`, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, display: "inline-block", boxShadow: bot.status === "running" ? `0 0 0 3px ${statusColor}33` : "none", animation: bot.status === "running" || bot.status === "starting" ? "pulse 2s infinite" : "none" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>{STATUS_AR[bot.status]}</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Save */}
          <button
            onClick={handleSaveFile}
            disabled={saveFile.isPending || !isDirty}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: isDirty ? "pointer" : "default", border: `1px solid ${isDirty ? E.orange : E.border}`, background: isDirty ? E.orangeLight : "transparent", color: isDirty ? E.orange : E.muted, transition: "all .15s" }}
          >
            {saveFile.isPending ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Save size={12} />}
            {isDirty ? "حفظ*" : "محفوظ"}
          </button>

          {/* Restart */}
          <button
            onClick={() => handleAction(restartBot, "✓ تمت إعادة التشغيل")}
            disabled={restartBot.isPending}
            title="إعادة تشغيل"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 7, border: `1px solid ${E.border}`, background: "transparent", color: E.muted, cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = E.text; e.currentTarget.style.borderColor = E.muted; }}
            onMouseLeave={e => { e.currentTarget.style.color = E.muted; e.currentTarget.style.borderColor = E.border; }}
          >
            <RotateCw size={13} style={restartBot.isPending ? { animation: "spin .8s linear infinite" } : {}} />
          </button>

          {/* Play / Stop */}
          {!isRunning ? (
            <button
              onClick={() => handleAction(startBot, "✓ بدأ تشغيل البوت")}
              disabled={startBot.isPending}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "none", background: E.green, color: "#0D1117", cursor: "pointer", transition: "background .15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#2EA043")}
              onMouseLeave={e => (e.currentTarget.style.background = E.green)}
            >
              {startBot.isPending ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Play size={12} style={{ fill: "#0D1117" }} />}
              تشغيل
            </button>
          ) : (
            <button
              onClick={() => handleAction(stopBot, "✓ توقف البوت")}
              disabled={stopBot.isPending}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "none", background: E.red, color: "#fff", cursor: "pointer", transition: "background .15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#DA3633")}
              onMouseLeave={e => (e.currentTarget.style.background = E.red)}
            >
              {stopBot.isPending ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Square size={12} style={{ fill: "#fff" }} />}
              إيقاف
            </button>
          )}
        </div>
      </header>

      {/* ── Editor + Panel ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Monaco editor */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", borderLeft: `1px solid ${E.border}` }}>
          {fileLoading ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 style={{ color: E.muted, width: 20, height: 20, animation: "spin .8s linear infinite" }} />
            </div>
          ) : (
            <Editor
              height="100%"
              language={monacoLang}
              value={code}
              theme="vs-dark"
              onChange={val => { setCode(val ?? ""); setIsDirty(true); }}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
                fontLigatures: true,
                lineHeight: 22,
                minimap: { enabled: true, scale: 1, renderCharacters: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "on",
                glyphMargin: true,
                folding: true,
                foldingHighlight: true,
                automaticLayout: true,
                tabSize: 2,
                renderLineHighlight: "line",
                renderLineHighlightOnlyWhenFocus: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorStyle: "line",
                cursorWidth: 2,
                padding: { top: 16, bottom: 16 },
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
                suggest: { showKeywords: true },
                scrollbar: { vertical: "auto", horizontal: "auto", useShadows: true },
                overviewRulerLanes: 2,
                renderWhitespace: "selection",
                colorDecorators: true,
                linkedEditing: true,
                occurrencesHighlight: "singleFile",
                selectionHighlight: true,
                matchBrackets: "always",
              }}
            />
          )}
        </div>

        {/* Right panel */}
        <div style={{ width: 360, display: "flex", flexDirection: "column", minHeight: 0, flexShrink: 0, borderRight: `1px solid ${E.border}`, background: E.bgPanel }}>

          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: `1px solid ${E.border}`, background: E.bgHeader, flexShrink: 0, overflowX: "auto" }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "9px 14px", fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                  whiteSpace: "nowrap", cursor: "pointer", border: "none",
                  borderBottom: `2px solid ${activeTab === t.id ? E.orange : "transparent"}`,
                  background: "transparent",
                  color: activeTab === t.id ? E.text : E.muted,
                  transition: "color .15s",
                }}
                onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.color = E.text; }}
                onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.color = E.muted; }}
              >
                {t.icon}
                {t.label}
                {/* SSE indicator on console tab */}
                {t.id === "console" && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: sseConnected ? E.green : E.mutedDim, marginRight: 2, display: "inline-block" }} />
                )}
                {/* Count badge on secrets tab */}
                {t.id === "secrets" && envRows.length > 0 && (
                  <span style={{ fontSize: 10, background: E.orangeLight, color: E.orange, borderRadius: 4, padding: "1px 5px", marginRight: 2 }}>{envRows.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── وحدة التحكم ────────────────────────────────── */}
          {activeTab === "console" && (
            <div style={{ flex: 1, minHeight: 0, background: "#010409", display: "flex", flexDirection: "column" }}>
              {/* Console header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderBottom: `1px solid ${E.border}`, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: sseConnected ? E.green : E.muted }}>
                  {sseConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                  {sseConnected ? "مباشر" : "جاري الاتصال..."}
                </div>
                <button
                  onClick={() => setLogs([])}
                  style={{ fontSize: 11, color: E.mutedDim, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4, transition: "color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = E.muted)}
                  onMouseLeave={e => (e.currentTarget.style.color = E.mutedDim)}
                >
                  مسح
                </button>
              </div>
              {/* Log lines */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {logs.length === 0 ? (
                  <p style={{ textAlign: "center", color: E.mutedDim, fontSize: 12, padding: "40px 16px", fontFamily: "'JetBrains Mono',monospace" }}>
                    شغّل البوت لرؤية المخرجات...
                  </p>
                ) : logs.map((log, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 8, padding: "1px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, lineHeight: "20px", color: log.level === "error" ? E.red : "#ABB2BF" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#0D1117")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ color: E.mutedDim, flexShrink: 0, fontSize: 11, lineHeight: "20px" }}>
                      {new Date(log.timestamp).toTimeString().slice(0, 8)}
                    </span>
                    {log.level === "error" && <AlertCircle size={12} style={{ marginTop: 4, flexShrink: 0, color: E.red }} />}
                    <span style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* ── الطرفية ─────────────────────────────────── */}
          {activeTab === "terminal" && (
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <TerminalPanel botId={id!} active={activeTab === "terminal"} />
            </div>
          )}

          {/* ── الأسرار ─────────────────────────────────── */}
          {activeTab === "secrets" && (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <ScrollArea style={{ flex: 1 }}>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ fontSize: 12, color: E.muted, lineHeight: 1.7, background: E.bgRow, borderRadius: 8, padding: "10px 12px", border: `1px solid ${E.border}` }}>
                    تُحقن متغيرات البيئة عند بدء التشغيل. استخدم{" "}
                    <code style={{ background: E.bg, padding: "1px 5px", borderRadius: 4, fontSize: 11, color: E.blue }}>process.env.KEY</code>{" "}
                    في JS أو{" "}
                    <code style={{ background: E.bg, padding: "1px 5px", borderRadius: 4, fontSize: 11, color: E.blue }}>os.environ['KEY']</code>{" "}
                    في Python.
                  </p>

                  {envRows.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: E.mutedDim }}>
                      <KeyRound size={32} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                      <p style={{ fontSize: 12 }}>لا توجد أسرار بعد</p>
                    </div>
                  ) : envRows.map((row, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={row.key}
                        onChange={e => updateEnvRow(i, "key", e.target.value)}
                        placeholder="المفتاح"
                        style={{ width: 110, flexShrink: 0, height: 30, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", background: E.bgInput, border: `1px solid ${E.border}`, borderRadius: 6, padding: "0 8px", color: E.text, outline: "none" }}
                        onFocus={e => (e.currentTarget.style.borderColor = E.orange)}
                        onBlur={e => (e.currentTarget.style.borderColor = E.border)}
                      />
                      <div style={{ position: "relative", flex: 1 }}>
                        <input
                          type={row.visible ? "text" : "password"}
                          value={row.value}
                          onChange={e => updateEnvRow(i, "value", e.target.value)}
                          placeholder="القيمة"
                          style={{ width: "100%", height: 30, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", background: E.bgInput, border: `1px solid ${E.border}`, borderRadius: 6, padding: "0 30px 0 8px", color: E.text, outline: "none", boxSizing: "border-box" }}
                          onFocus={e => (e.currentTarget.style.borderColor = E.orange)}
                          onBlur={e => (e.currentTarget.style.borderColor = E.border)}
                        />
                        <button
                          onClick={() => toggleVisible(i)}
                          style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: E.muted, display: "flex" }}
                        >
                          {row.visible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <button onClick={() => removeEnvRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: E.muted, display: "flex", flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = E.red)}
                        onMouseLeave={e => (e.currentTarget.style.color = E.muted)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={addEnvRow}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px", fontSize: 12, fontWeight: 600, background: "transparent", border: `1px dashed ${E.border}`, borderRadius: 7, color: E.muted, cursor: "pointer", transition: "all .15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = E.orange; e.currentTarget.style.color = E.orange; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = E.border; e.currentTarget.style.color = E.muted; }}
                  >
                    <Plus size={13} /> إضافة سر
                  </button>
                </div>
              </ScrollArea>
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${E.border}`, flexShrink: 0, background: E.bgHeader }}>
                <button
                  onClick={handleSaveEnv}
                  disabled={saveEnv.isPending}
                  style={{ width: "100%", padding: "8px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", borderRadius: 7, border: "none", background: E.orange, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#D95600")}
                  onMouseLeave={e => (e.currentTarget.style.background = E.orange)}
                >
                  {saveEnv.isPending ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle2 size={13} />}
                  حفظ الأسرار
                </button>
                <p style={{ fontSize: 11, color: E.mutedDim, textAlign: "center", marginTop: 6 }}>
                  أعِد تشغيل البوت لتطبيق الأسرار الجديدة
                </p>
              </div>
            </div>
          )}

          {/* ── الحزم ───────────────────────────────────── */}
          {activeTab === "packages" && bot && (
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <PackagesPanel botId={id!} language={bot.language as "javascript" | "python"} />
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar (bottom) ─────────────────────────────────────── */}
      <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", background: E.orange, flexShrink: 0, fontSize: 11, color: "#fff", fontFamily: "'JetBrains Mono','Cairo',sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", opacity: 0.9, display: "inline-block" }} />
            NexusOps
          </span>
          <span>{bot.language === "python" ? "Python 3" : "JavaScript"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>{isDirty ? "● غير محفوظ" : "✓ محفوظ"}</span>
          <span>{sseConnected ? "● مباشر" : "○ غير متصل"}</span>
          <span style={{ fontFamily: "'Cairo',sans-serif" }}>Ctrl+S للحفظ</span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363D; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #484F58; }
      `}</style>
    </div>
  );
}
