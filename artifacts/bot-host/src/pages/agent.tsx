import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useListAnthropicConversations,
  useCreateAnthropicConversation,
  useDeleteAnthropicConversation,
  useGetAnthropicConversation,
  useListBots,
  useAgentDeployBot,
  getListAnthropicConversationsQueryKey,
  getGetAnthropicConversationQueryKey,
  AnthropicConversation,
  AnthropicMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Plus,
  Send,
  Sparkles,
  Copy,
  Rocket,
  Code2,
  MessageSquare,
  ChevronRight,
  X,
  FileCode,
  Terminal,
  RotateCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  ScrollText,
  ImageIcon,
  Paperclip,
  Trash2,
  FolderTree,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CodeBlock {
  lang: string;
  code: string;
}

/* ── Streaming event types ─────────────────────────────────────────────── */

type ToolEvent =
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_running"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; output: string };

type StreamEvent =
  | { type: "text"; content: string }
  | ToolEvent;

const TOOL_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  read_bot_file:  { label: "قراءة ملف البوت", icon: <FileCode size={13} /> },
  write_bot_file: { label: "كتابة كود البوت", icon: <Code2 size={13} /> },
  list_files:     { label: "تصفّح الملفات", icon: <FolderTree size={13} /> },
  read_file:      { label: "قراءة ملف", icon: <FileCode size={13} /> },
  write_file:     { label: "كتابة ملف", icon: <Code2 size={13} /> },
  delete_file:    { label: "حذف ملف", icon: <Trash2 size={13} /> },
  install_packages: { label: "تثبيت حزم", icon: <Terminal size={13} /> },
  run_command:    { label: "تشغيل أمر", icon: <Terminal size={13} /> },
  get_bot_logs:   { label: "قراءة اللوغات", icon: <ScrollText size={13} /> },
  restart_bot:    { label: "إعادة تشغيل البوت", icon: <RotateCw size={13} /> },
  start_bot:      { label: "تشغيل البوت", icon: <Play size={13} /> },
  stop_bot:       { label: "إيقاف البوت", icon: <Square size={13} /> },
};

type ImgMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const ALLOWED_IMG_MIMES: readonly ImgMime[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_ATTACHMENTS_UI = 5;

interface PendingAttachment {
  id: string;
  name: string;
  mediaType: ImgMime;
  data: string; // base64 (no prefix)
  preview: string; // data URL for thumbnail
}

function fileToAttachment(file: File): Promise<PendingAttachment | null> {
  return new Promise((resolve) => {
    if (!ALLOWED_IMG_MIMES.includes(file.type as ImgMime)) { resolve(null); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      const data = comma >= 0 ? dataUrl.slice(comma + 1) : "";
      resolve({
        id: Math.random().toString(36).slice(2),
        name: file.name,
        mediaType: file.type as ImgMime,
        data,
        preview: dataUrl,
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

interface ParsedSegment {
  type: "text" | "code";
  content: string;
  lang?: string;
}

function parseMessage(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1] || "text", content: match[2] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }

  return segments;
}

function InlineText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const boldParts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className={cn("leading-relaxed", line === "" && "h-2")}>
            {boldParts.map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="font-semibold text-foreground">{part}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

interface CodeBlockViewProps {
  lang: string;
  code: string;
  onDeploy: (code: string, lang: string) => void;
}

function CodeBlockView({ lang, code, onDeploy }: CodeBlockViewProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast({ title: "✓ تم النسخ", description: "نُسخ الكود إلى الحافظة." });
  };

  const isBot = lang === "javascript" || lang === "js" || lang === "python" || lang === "py";

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">{lang || "code"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleCopy}>
            <Copy className="w-3 h-3 ml-1" />
            نسخ
          </Button>
          {isBot && (
            <Button
              size="sm"
              className="h-6 px-2 text-xs bg-primary hover:bg-primary/90"
              onClick={() => onDeploy(code, lang)}
            >
              <Rocket className="w-3 h-3 ml-1" />
              نشر البوت
            </Button>
          )}
        </div>
      </div>
      <pre className="p-4 overflow-x-auto text-sm bg-background/50">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  );
}

/* ── Tool Call Card ─────────────────────────────────────────────────────── */

interface ToolCardProps {
  name: string;
  input?: Record<string, unknown>;
  output?: string;
  status: "starting" | "running" | "done";
}

function ToolCard({ name, input, output, status }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_LABELS[name] ?? { label: name, icon: <Terminal size={13} /> };

  const inputPreview = name === "write_bot_file" && input?.code
    ? `${String(input.code).split("\n").length} سطر من الكود`
    : name === "run_command" && input?.command
    ? String(input.command)
    : null;

  return (
    <div style={{
      margin: "6px 0",
      borderRadius: 10,
      border: `1px solid ${status === "done" ? "#BBF7D0" : "#E8DDD5"}`,
      background: status === "done" ? "#F0FDF4" : "#FAF7F2",
      overflow: "hidden",
      fontSize: 12,
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: output ? "pointer" : "default" }}
        onClick={() => output && setExpanded(e => !e)}
      >
        <span style={{ color: status === "done" ? "#16A34A" : "#F26207", display: "flex" }}>
          {status === "done" ? <CheckCircle2 size={13} /> : (
            <span style={{ animation: "spin 1s linear infinite", display: "inline-flex" }}><RotateCw size={13} /></span>
          )}
        </span>
        <span style={{ color: "#6B6B6B", display: "flex", alignItems: "center", gap: 4 }}>
          {meta.icon}
        </span>
        <span style={{ fontWeight: 600, color: "#0D0D0D", flex: 1 }}>{meta.label}</span>
        {inputPreview && (
          <span style={{ color: "#6B6B6B", fontFamily: "monospace", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {inputPreview}
          </span>
        )}
        {output && (expanded ? <ChevronUp size={12} color="#6B6B6B" /> : <ChevronDown size={12} color="#6B6B6B" />)}
      </div>
      {expanded && output && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #E8DDD5", background: "#fff" }}>
          <pre style={{ fontSize: 11, fontFamily: "monospace", color: "#374151", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto", margin: 0 }}>
            {output.length > 2000 ? output.slice(0, 2000) + "\n...(مقتطع)" : output}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Streaming display ─────────────────────────────────────────────────── */

interface StreamingDisplayProps {
  events: StreamEvent[];
  onDeploy: (code: string, lang: string) => void;
}

function StreamingDisplay({ events, onDeploy }: StreamingDisplayProps) {
  // Build tool states: combine tool_start, tool_running, tool_result by id
  const toolStates = new Map<string, { name: string; input?: Record<string, unknown>; output?: string; status: "starting" | "running" | "done" }>();
  let textContent = "";

  for (const ev of events) {
    if (ev.type === "text") {
      textContent += ev.content;
    } else if (ev.type === "tool_start") {
      toolStates.set(ev.id, { name: ev.name, status: "starting" });
    } else if (ev.type === "tool_running") {
      const existing = toolStates.get(ev.id);
      toolStates.set(ev.id, { name: ev.name, input: ev.input, status: "running", output: existing?.output });
    } else if (ev.type === "tool_result") {
      const existing = toolStates.get(ev.id);
      toolStates.set(ev.id, { name: ev.name, input: existing?.input, output: ev.output, status: "done" });
    }
  }

  // Render tools in order they appeared (by insertion order of ids)
  const toolOrder: string[] = [];
  for (const ev of events) {
    if (ev.type === "tool_start" && !toolOrder.includes(ev.id)) toolOrder.push(ev.id);
  }

  const segments = parseMessage(textContent);

  return (
    <div className="flex gap-3 px-4 py-3 justify-start">
      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4 text-primary" />
      </div>
      <div className="max-w-[85%] flex flex-col gap-1">
        {toolOrder.map(id => {
          const s = toolStates.get(id);
          if (!s) return null;
          return <ToolCard key={id} name={s.name} input={s.input} output={s.output} status={s.status} />;
        })}
        {textContent && (
          <div className="text-sm text-foreground/90">
            {segments.map((seg, i) =>
              seg.type === "code" ? (
                <CodeBlockView key={i} lang={seg.lang!} code={seg.content} onDeploy={onDeploy} />
              ) : (
                <InlineText key={i} text={seg.content} />
              )
            )}
            <span className="inline-block w-2 h-4 bg-primary/70 rounded animate-pulse ml-0.5" />
          </div>
        )}
        {!textContent && toolOrder.length === 0 && (
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
            <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: AnthropicMessage | { role: string; content: string; id?: number; streaming?: boolean };
  onDeploy: (code: string, lang: string) => void;
}

function MessageBubble({ message, onDeploy }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const segments = parseMessage(message.content);
  const attachments = (message as { attachments?: Array<{ mediaType: string; data: string; name?: string }> | null }).attachments;

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
      )}

      <div className={cn(
        "max-w-[85%]",
        isUser
          ? "bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-2.5"
          : "flex flex-col gap-1"
      )}>
        {isUser ? (
          <div className="space-y-2">
            {attachments && attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <img
                    key={i}
                    src={`data:${a.mediaType};base64,${a.data}`}
                    alt={a.name ?? `attachment-${i}`}
                    className="rounded-md border border-border/40 max-h-40 max-w-full object-contain bg-background"
                  />
                ))}
              </div>
            )}
            {message.content && (
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        ) : (
          <div className="text-sm text-foreground/90">
            {segments.map((seg, i) =>
              seg.type === "code" ? (
                <CodeBlockView key={i} lang={seg.lang!} code={seg.content} onDeploy={onDeploy} />
              ) : (
                <InlineText key={i} text={seg.content} />
              )
            )}
            {"streaming" in message && message.streaming && (
              <span className="inline-block w-2 h-4 bg-primary/70 rounded animate-pulse ml-0.5" />
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

interface NewConvDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (title: string, botId?: string) => void;
  bots: Array<{ id: string; name: string }>;
}

function NewConvDialog({ open, onClose, onConfirm, bots }: NewConvDialogProps) {
  const [title, setTitle] = useState("");
  const [botId, setBotId] = useState<string>("none");

  const handleConfirm = () => {
    if (!title.trim()) return;
    onConfirm(title.trim(), botId === "none" ? undefined : botId);
    setTitle("");
    setBotId("none");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            جلسة وكيل جديدة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">اسم الجلسة</label>
            <Input
              placeholder="مثال: بناء بوت إشراف"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              autoFocus
            />
          </div>
          {bots.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                ربط ببوت موجود <span className="text-xs">(اختياري)</span>
              </label>
              <Select value={botId} onValueChange={setBotId}>
                <SelectTrigger>
                  <SelectValue placeholder="لا يوجد بوت مرتبط" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">لا يوجد بوت مرتبط</SelectItem>
                  {bots.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ربط بوت يمنح الوكيل سياقاً عن الكود الموجود.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleConfirm} disabled={!title.trim()}>
            <Plus className="w-4 h-4 ml-1.5" />
            بدء الجلسة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeployDialogProps {
  open: boolean;
  code: string;
  lang: string;
  onClose: () => void;
  onDeploy: (name: string, language: string, code: string) => void;
  loading: boolean;
}

function DeployDialog({ open, code, lang, onClose, onDeploy, loading }: DeployDialogProps) {
  const [name, setName] = useState("");
  const detectedLang = lang === "py" || lang === "python" ? "python" : "javascript";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            نشر البوت
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">اسم البوت</label>
            <Input
              placeholder="مثال: بوت الإشراف، مساعد الموسيقى"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && name.trim() && onDeploy(name.trim(), detectedLang, code)}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/50">
            <Code2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              اللغة: <span className="font-medium text-foreground">{detectedLang}</span>
              {" · "}
              {code.split("\n").length} سطر من الكود
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            سيُضاف البوت إلى قائمتك في حالة متوقفة. أضف BOT_TOKEN وشغّله من لوحة التحكم.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>إلغاء</Button>
          <Button
            onClick={() => name.trim() && onDeploy(name.trim(), detectedLang, code)}
            disabled={!name.trim() || loading}
          >
            {loading ? "جاري النشر..." : "نشر"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployCode, setDeployCode] = useState({ code: "", lang: "" });
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingEvents, setStreamingEvents] = useState<StreamEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);

  const { data: convList = [] } = useListAnthropicConversations();
  const { data: activeConv } = useGetAnthropicConversation(activeConvId ?? 0, {
    query: {
      enabled: !!activeConvId,
      queryKey: getGetAnthropicConversationQueryKey(activeConvId ?? 0),
    },
  });
  const { data: botsData = [] } = useListBots();
  const createConv = useCreateAnthropicConversation();
  const deleteConv = useDeleteAnthropicConversation();
  const deployBot = useAgentDeployBot();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages, streamingEvents]);

  useEffect(() => {
    if (activeConvId) {
      inputRef.current?.focus();
    }
  }, [activeConvId]);

  const handleNewConv = async (title: string, botId?: string) => {
    const conv = await createConv.mutateAsync({ data: { title, botId: botId ?? null } });
    setNewConvOpen(false);
    setActiveConvId(conv.id);
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
  };

  // Auto-start from template redirect
  useEffect(() => {
    if (autoStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const botId = params.get("botId");
    const botName = params.get("botName");
    const prompt = params.get("prompt");
    if (!botId && !prompt) return;
    autoStarted.current = true;

    const title = botName ? `تطوير: ${botName}` : "تخصيص قالب";
    createConv.mutateAsync({ data: { title, botId: botId ?? null } }).then(conv => {
      setActiveConvId(conv.id);
      qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
      if (prompt) {
        setInput(decodeURIComponent(prompt));
        setTimeout(() => inputRef.current?.focus(), 300);
      }
      // Clean URL params without reload
      window.history.replaceState({}, "", window.location.pathname);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConv.mutateAsync({ id });
    if (activeConvId === id) setActiveConvId(null);
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
  };

  const handleSend = useCallback(async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || !activeConvId || streaming) return;

    const message = input.trim();
    const attachmentsToSend = pendingAttachments.map(a => ({
      type: "image" as const,
      mediaType: a.mediaType,
      data: a.data,
      name: a.name,
    }));
    setInput("");
    setPendingAttachments([]);
    setStreaming(true);
    setStreamingEvents([]);

    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${BASE}/api/anthropic/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
          ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {}),
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      qc.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(activeConvId) });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let json: Record<string, unknown>;
          try { json = JSON.parse(line.slice(6)); } catch { continue; }

          if (json.type === "text" && json.content) {
            setStreamingEvents(prev => [...prev, { type: "text", content: json.content as string }]);
          } else if (json.type === "tool_start") {
            setStreamingEvents(prev => [...prev, { type: "tool_start", id: json.id as string, name: json.name as string }]);
          } else if (json.type === "tool_running") {
            setStreamingEvents(prev => [...prev, { type: "tool_running", id: json.id as string, name: json.name as string, input: (json.input ?? {}) as Record<string, unknown> }]);
          } else if (json.type === "tool_result") {
            setStreamingEvents(prev => [...prev, { type: "tool_result", id: json.id as string, name: json.name as string, output: json.output as string }]);
          } else if (json.type === "done") {
            qc.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(activeConvId) });
            setStreamingEvents([]);
          } else if (json.type === "error") {
            throw new Error(json.error as string);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast({ title: "خطأ", description: (err as Error).message, variant: "destructive" });
        setStreamingEvents([]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, pendingAttachments, activeConvId, streaming, qc, toast]);

  const addFiles = useCallback(async (files: File[] | FileList) => {
    const arr = Array.from(files);
    const remaining = MAX_ATTACHMENTS_UI - pendingAttachments.length;
    if (remaining <= 0) {
      toast({ title: "الحد الأقصى للصور", description: `يمكن إرفاق ${MAX_ATTACHMENTS_UI} صور كحد أقصى.`, variant: "destructive" });
      return;
    }
    let rejected = 0;
    const accepted: PendingAttachment[] = [];
    for (const f of arr.slice(0, remaining)) {
      const att = await fileToAttachment(f);
      if (att) accepted.push(att); else rejected++;
    }
    if (accepted.length > 0) setPendingAttachments(prev => [...prev, ...accepted]);
    if (rejected > 0) {
      toast({
        title: "تم تجاهل بعض الملفات",
        description: `الصور المسموحة: PNG, JPEG, GIF, WebP — أقل من 4MB.`,
        variant: "destructive",
      });
    }
  }, [pendingAttachments.length, toast]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeployClick = (code: string, lang: string) => {
    setDeployCode({ code, lang });
    setDeployOpen(true);
  };

  const handleDeploy = async (name: string, language: string, code: string) => {
    try {
      await deployBot.mutateAsync({ data: { name, language: language as "javascript" | "python", code } });
      toast({
        title: "✓ تم نشر البوت",
        description: `أُضيف "${name}" إلى قائمة بوتاتك.`,
      });
      setDeployOpen(false);
      qc.invalidateQueries({ queryKey: ["listBots"] });
    } catch (err) {
      toast({
        title: "فشل النشر",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  const messages = activeConv?.messages ?? [];
  const linkedBot = activeConv?.botId
    ? botsData.find((b) => b.id === activeConv.botId)
    : null;

  return (
    <Layout>
      <div className="flex gap-0 -mx-4 -my-8 h-[calc(100vh-4rem)]">
        <div className="w-64 border-r border-border/50 flex flex-col bg-muted/20">
          <div className="p-4 border-b border-border/50">
            <Button
              className="w-full"
              size="sm"
              onClick={() => setNewConvOpen(true)}
            >
              <Plus className="w-4 h-4 ml-1.5" />
              جلسة جديدة
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {convList.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">لا توجد جلسات بعد</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">ابدأ جلسة جديدة للبرمجة مع Agent-4</p>
                </div>
              )}
              {convList.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
                    activeConvId === conv.id
                      ? "bg-primary/10 text-foreground border border-primary/20"
                      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                  <span className="flex-1 truncate text-xs font-medium">{conv.title}</span>
                  <button
                    onClick={(e) => handleDeleteConv(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border/50">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/10">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <div>
                <p className="text-xs font-semibold text-primary">Agent-4</p>
                <p className="text-[10px] text-muted-foreground">مدعوم بـ Claude</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {!activeConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Agent-4</h2>
                <p className="text-muted-foreground max-w-md">
                  مطوّر بوتات Discord بالذكاء الاصطناعي. صف ما تريد وسيكتب الكود ويصلح الأخطاء وينشر البوت نيابةً عنك.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                {[
                  { icon: "🤖", text: "ابنِ بوت !ping باستخدام discord.js" },
                  { icon: "🎵", text: "أنشئ بوت موسيقى مع دعم YouTube" },
                  { icon: "🛡️", text: "أضف نظام إشراف تلقائي" },
                  { icon: "🎮", text: "اصنع بوت ألعاب وأسئلة ترفيهية" },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setNewConvOpen(true);
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 text-left transition-colors text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span>{item.icon}</span>
                    <span className="text-xs">{item.text}</span>
                    <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0 opacity-40" />
                  </button>
                ))}
              </div>

              <Button onClick={() => setNewConvOpen(true)} size="lg" className="px-8">
                <Plus className="w-4 h-4 ml-2" />
                ابدأ البرمجة
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{activeConv?.title ?? "Agent-4"}</h3>
                    {linkedBot && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        مرتبط بـ: {linkedBot.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {linkedBot && ["website", "game", "web-app"].includes(((linkedBot as unknown) as { projectType?: string }).projectType ?? "") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
                        window.open(`${BASE}/api/preview/${linkedBot.id}`, "_blank", "noopener,noreferrer");
                      }}
                      title="افتح المعاينة المباشرة في نافذة جديدة"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      معاينة مباشرة
                    </Button>
                  )}
                  {streaming && (() => {
                  const lastTool = [...streamingEvents].reverse().find(e => e.type === "tool_start" || e.type === "tool_running");
                  const isRunningTool = lastTool && !streamingEvents.find(e => e.type === "tool_result" && e.id === (lastTool as { id: string }).id);
                  const toolMeta = isRunningTool ? TOOL_LABELS[(lastTool as { name: string }).name] : null;
                  return (
                    <Badge variant="secondary" className="text-xs animate-pulse gap-1">
                      {isRunningTool && toolMeta ? (
                        <>
                          <RotateCw className="w-3 h-3 animate-spin" />
                          {toolMeta.label}...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          الوكيل يفكر...
                        </>
                      )}
                    </Badge>
                  );
                })()}
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="py-4 space-y-1">
                  {messages.length === 0 && !streaming && (
                    <div className="px-6 py-8 text-center text-muted-foreground">
                      <p className="text-sm">ابدأ المحادثة — اطلب من Agent-4 بناء بوتك.</p>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} onDeploy={handleDeployClick} />
                  ))}

                  {streaming && (
                    <StreamingDisplay events={streamingEvents} onDeploy={handleDeployClick} />
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div
                className={cn(
                  "px-4 pb-4 pt-2 border-t border-border/50 flex-shrink-0 transition-colors",
                  isDragging && "bg-primary/5 ring-2 ring-primary/30 ring-inset"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
              >
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingAttachments.map(att => (
                      <div key={att.id} className="relative group">
                        <img
                          src={att.preview}
                          alt={att.name}
                          className="h-16 w-16 object-cover rounded-md border border-border/50"
                        />
                        <button
                          type="button"
                          onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== att.id))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-90 hover:opacity-100 shadow"
                          title="إزالة"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="flex gap-2 items-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={streaming || pendingAttachments.length >= MAX_ATTACHMENTS_UI}
                    className="flex-shrink-0 h-[60px] w-10"
                    title="إرفاق صورة (يدعم اللصق والسحب والإفلات)"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={isDragging ? "أفلت الصورة هنا..." : "صف ما تريد، أرفق صورة لإعادة بنائها، أصلح الأخطاء... (Enter للإرسال)"}
                    className="min-h-[60px] max-h-[160px] resize-none text-sm"
                    disabled={streaming}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={(!input.trim() && pendingAttachments.length === 0) || streaming}
                    className="flex-shrink-0 h-[60px] w-10"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-1 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  أرسل صورة وسيعيد Agent-4 بناءها · مدعوم بـ Claude Opus 4
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <NewConvDialog
        open={newConvOpen}
        onClose={() => setNewConvOpen(false)}
        onConfirm={handleNewConv}
        bots={botsData}
      />

      <DeployDialog
        open={deployOpen}
        code={deployCode.code}
        lang={deployCode.lang}
        onClose={() => setDeployOpen(false)}
        onDeploy={handleDeploy}
        loading={deployBot.isPending}
      />
    </Layout>
  );
}
