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
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface EnvRow {
  key: string;
  value: string;
  visible: boolean;
}

interface LogLine {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

const STATUS_COLORS: Record<BotStatus, string> = {
  running: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  stopped: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  crashed: "bg-red-500/10 text-red-400 border-red-500/20",
  starting: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function BotEditor() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [code, setCode] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"console" | "secrets">("console");
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

  // Load file into editor
  useEffect(() => {
    if (fileData?.content !== undefined && !isDirty) {
      setCode(fileData.content);
    }
  }, [fileData?.content]);

  // Load env vars
  useEffect(() => {
    if (envData?.vars) {
      setEnvRows(envData.vars.map((v) => ({ key: v.key, value: v.value, visible: false })));
    }
  }, [envData]);

  // SSE log stream
  useEffect(() => {
    if (!id) return;
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${BASE}/api/bots/${id}/logs/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const entry: LogLine = JSON.parse(e.data);
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } catch {}
    };

    return () => {
      es.close();
      esRef.current = null;
      setSseConnected(false);
    };
  }, [id]);

  // Auto-scroll console
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const invalidateBotQueries = () => {
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
      toast({ title: "Saved", description: "Bot file saved successfully." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }, [id, code, saveFile, qc, toast]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSaveFile]);

  const handleBotAction = (action: any, label: string) => {
    action.mutate({ id: id! }, {
      onSuccess: () => {
        invalidateBotQueries();
        toast({ title: label });
      },
      onError: (e: any) => {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      },
    });
  };

  const handleSaveEnv = async () => {
    if (!id) return;
    const cleanVars = envRows
      .filter((r) => r.key.trim())
      .map(({ key, value }) => ({ key: key.trim(), value }));
    try {
      await saveEnv.mutateAsync({ id, data: { vars: cleanVars } });
      qc.invalidateQueries({ queryKey: getGetBotEnvQueryKey(id) });
      toast({ title: "Secrets saved", description: "Environment variables updated." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const addEnvRow = () => {
    setEnvRows((prev) => [...prev, { key: "", value: "", visible: false }]);
  };

  const removeEnvRow = (i: number) => {
    setEnvRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateEnvRow = (i: number, field: "key" | "value", val: string) => {
    setEnvRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  const toggleVisible = (i: number) => {
    setEnvRows((prev) => prev.map((r, idx) => idx === i ? { ...r, visible: !r.visible } : r));
  };

  const monacoLang = bot?.language === "python" ? "python" : "javascript";

  const isRunning = bot?.status === "running" || bot?.status === "starting";

  if (botLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!bot) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Bot not found.</p>
          <Button asChild variant="outline"><Link href="/">← Back</Link></Button>
        </div>
      </Layout>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 bg-background/90 backdrop-blur flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
          <Link href="/"><ArrowLeft className="w-3.5 h-3.5" /></Link>
        </Button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate">{bot.name}</span>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-mono uppercase shrink-0", STATUS_COLORS[bot.status])}
          >
            {bot.status === "running" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse inline-block" />
            )}
            {bot.status}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono hidden sm:block">
            {bot.filename}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Save */}
          <Button
            variant={isDirty ? "default" : "outline"}
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={handleSaveFile}
            disabled={saveFile.isPending || !isDirty}
          >
            {saveFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isDirty ? "Save*" : "Saved"}
          </Button>

          {/* Run / Stop */}
          {!isRunning ? (
            <Button
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleBotAction(startBot, "Bot started")}
              disabled={startBot.isPending}
            >
              <Play className="w-3.5 h-3.5" />
              Run
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-3 text-xs gap-1.5"
              onClick={() => handleBotAction(stopBot, "Bot stopped")}
              disabled={stopBot.isPending}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => handleBotAction(restartBot, "Bot restarted")}
            disabled={restartBot.isPending}
          >
            <RotateCw className={cn("w-3.5 h-3.5", restartBot.isPending && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Monaco editor */}
        <div className="flex-1 min-w-0 border-r border-border/50">
          {fileLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Editor
              height="100%"
              language={monacoLang}
              value={code}
              theme="vs-dark"
              onChange={(val) => {
                setCode(val ?? "");
                setIsDirty(true);
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "on",
                glyphMargin: false,
                folding: true,
                automaticLayout: true,
                tabSize: 2,
                renderLineHighlight: "line",
                smoothScrolling: true,
                cursorBlinking: "smooth",
                padding: { top: 12, bottom: 12 },
              }}
            />
          )}
        </div>

        {/* Right panel */}
        <div className="w-[340px] xl:w-[400px] flex flex-col min-h-0 flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-border/50 bg-muted/20 flex-shrink-0">
            <button
              onClick={() => setActiveTab("console")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                activeTab === "console"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Terminal className="w-3.5 h-3.5" />
              Console
              {sseConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("secrets")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                activeTab === "secrets"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Secrets
              {envRows.length > 0 && (
                <span className="text-[10px] bg-primary/20 text-primary rounded px-1">
                  {envRows.length}
                </span>
              )}
            </button>
          </div>

          {/* Console */}
          {activeTab === "console" && (
            <div className="flex-1 min-h-0 bg-[#0c0c0e] flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
                <span className="text-[10px] font-mono text-zinc-500">
                  {sseConnected ? "● live" : "○ connecting..."}
                </span>
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Clear
                </button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 font-mono text-xs space-y-0.5">
                  {logs.length === 0 && (
                    <p className="text-zinc-600 py-4 text-center text-[11px]">
                      Start your bot to see logs...
                    </p>
                  )}
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2 leading-5 hover:bg-white/5 rounded px-1 -mx-1",
                        log.level === "error" ? "text-red-400" : "text-zinc-300"
                      )}
                    >
                      <span className="text-zinc-600 shrink-0 text-[10px] pt-px">
                        {new Date(log.timestamp).toTimeString().slice(0, 8)}
                      </span>
                      {log.level === "error" && (
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-red-500" />
                      )}
                      <span className="break-all whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Secrets */}
          {activeTab === "secrets" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    Environment variables are injected when your bot starts.
                    Use <code className="bg-muted px-1 rounded text-[11px]">process.env.KEY</code> in JS or{" "}
                    <code className="bg-muted px-1 rounded text-[11px]">os.environ.get('KEY')</code> in Python.
                  </p>

                  {envRows.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground">
                      <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">No secrets yet</p>
                    </div>
                  )}

                  {envRows.map((row, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input
                        value={row.key}
                        onChange={(e) => updateEnvRow(i, "key", e.target.value)}
                        placeholder="KEY"
                        className="h-7 text-xs font-mono w-28 flex-shrink-0"
                      />
                      <div className="relative flex-1">
                        <Input
                          type={row.visible ? "text" : "password"}
                          value={row.value}
                          onChange={(e) => updateEnvRow(i, "value", e.target.value)}
                          placeholder="value"
                          className="h-7 text-xs font-mono pr-7"
                        />
                        <button
                          type="button"
                          onClick={() => toggleVisible(i)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {row.visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      <button
                        onClick={() => removeEnvRow(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs mt-2"
                    onClick={addEnvRow}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Secret
                  </Button>
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border/50 flex-shrink-0">
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={handleSaveEnv}
                  disabled={saveEnv.isPending}
                >
                  {saveEnv.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save Secrets
                </Button>
                <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                  Restart the bot to apply new secrets
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
