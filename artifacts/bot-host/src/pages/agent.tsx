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
  Globe,
  RefreshCw,
  Folder,
  FolderOpen,
  File as FileIcon,
  Key,
  History,
  Search,
  Save,
  Coins,
  Smartphone,
  Tablet,
  Monitor,
} from "lucide-react";
import Editor from "@monaco-editor/react";
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
  web_search:     { label: "بحث في الويب", icon: <Globe size={13} /> },
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

/* ── Right-panel: file tree + bot logs types ───────────────────────────── */

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: TreeNode[];
}

interface BotLogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

const apiBase = () => import.meta.env.BASE_URL.replace(/\/$/, "");

function formatBytes(n?: number): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function monacoLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "json",
    py: "python",
    md: "markdown", markdown: "markdown",
    html: "html", htm: "html",
    css: "css", scss: "scss", less: "less",
    yml: "yaml", yaml: "yaml",
    toml: "ini", ini: "ini",
    sh: "shell", bash: "shell",
    sql: "sql",
    go: "go", rs: "rust", java: "java", rb: "ruby", php: "php",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp",
    xml: "xml", svg: "xml",
    env: "ini",
    dockerfile: "dockerfile",
  };
  return map[ext] ?? "plaintext";
}

function FileTreeNode({
  node,
  depth,
  openDirs,
  toggleDir,
  selectedPath,
  recentlyTouched,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  openDirs: Set<string>;
  toggleDir: (p: string) => void;
  selectedPath: string | null;
  recentlyTouched: Set<string>;
  onSelectFile: (n: TreeNode) => void;
}) {
  const isOpen = openDirs.has(node.path);
  const isSelected = selectedPath === node.path;
  const isRecent = recentlyTouched.has(node.path);
  const indent = depth * 12;

  if (node.type === "dir") {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleDir(node.path)}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted/60 transition-colors text-left",
            isRecent && "bg-primary/10"
          )}
          style={{ paddingInlineStart: 8 + indent }}
        >
          {isOpen ? <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 opacity-60 flex-shrink-0" />}
          {isOpen ? <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isOpen && node.children?.map((c) => (
          <FileTreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            openDirs={openDirs}
            toggleDir={toggleDir}
            selectedPath={selectedPath}
            recentlyTouched={recentlyTouched}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted/60 transition-colors text-left",
        isSelected && "bg-primary/15 text-primary",
        !isSelected && isRecent && "bg-primary/5"
      )}
      style={{ paddingInlineStart: 8 + indent + 14 }}
    >
      <FileIcon className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
      <span className="truncate flex-1">{node.name}</span>
      {isRecent && <span className="text-[9px] text-primary font-bold">●</span>}
      <span className="text-[9px] text-muted-foreground/60 ltr-text">{formatBytes(node.size)}</span>
    </button>
  );
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

  /* ── Right panel: files + logs + secrets + checkpoints + preview ───── */
  const [rightTab, setRightTab] = useState<"files" | "logs" | "secrets" | "checkpoints" | "preview">("files");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set([""]));
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [recentlyTouched, setRecentlyTouched] = useState<Set<string>>(new Set());
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);
  const [secrets, setSecrets] = useState<Array<{ key: string; preview: string; length: number }>>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<Array<{ sha: string; shortSha: string; subject: string; createdAt: string; isAutomatic: boolean }>>([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(false);
  const [restoringSha, setRestoringSha] = useState<string | null>(null);

  /* ── Editable file state ────────────────────────────────────────────── */
  const [editorContent, setEditorContent] = useState<string>("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  /* ── Global search ──────────────────────────────────────────────────── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ path: string; line: number; snippet: string; matchStart: number; matchEnd: number }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchScanned, setSearchScanned] = useState(0);

  /* ── Cost / usage ───────────────────────────────────────────────────── */
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number; costSar: number; costUsd: number } | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);
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

  /* ── Right panel: data fetchers ─────────────────────────────────────── */

  const linkedBotId = activeConv?.botId ?? null;

  const fetchTree = useCallback(async (botId: string) => {
    setTreeLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${botId}/files/tree`);
      if (!r.ok) throw new Error(`tree ${r.status}`);
      const json = await r.json() as { tree: TreeNode[] };
      setFileTree(json.tree ?? []);
    } catch {
      setFileTree([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // Token-based race guard: if a newer fetch is in flight, ignore older responses
  const fileFetchTokenRef = useRef(0);
  const fetchFileContent = useCallback(async (botId: string, path: string) => {
    const myToken = ++fileFetchTokenRef.current;
    setContentLoading(true);
    setContentError(null);
    setFileContent("");
    try {
      const r = await fetch(`${apiBase()}/api/bots/${botId}/files/content?path=${encodeURIComponent(path)}`);
      const json = await r.json() as { content?: string; error?: string };
      if (myToken !== fileFetchTokenRef.current) return; // stale response, drop it
      if (!r.ok) {
        setContentError(json.error ?? `error ${r.status}`);
      } else {
        setFileContent(json.content ?? "");
      }
    } catch (e) {
      if (myToken !== fileFetchTokenRef.current) return;
      setContentError((e as Error).message);
    } finally {
      if (myToken === fileFetchTokenRef.current) setContentLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async (botId: string) => {
    try {
      const r = await fetch(`${apiBase()}/api/bots/${botId}/logs`);
      if (!r.ok) return;
      const json = await r.json() as { logs?: BotLogEntry[] };
      setBotLogs(json.logs ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchSecrets = useCallback(async (botId: string) => {
    setSecretsLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${botId}/secrets`);
      if (!r.ok) { setSecrets([]); return; }
      const json = await r.json() as { secrets?: Array<{ key: string; preview: string; length: number }> };
      setSecrets(json.secrets ?? []);
    } catch { setSecrets([]); } finally { setSecretsLoading(false); }
  }, []);

  const fetchCheckpoints = useCallback(async (botId: string) => {
    setCheckpointsLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${botId}/checkpoints`);
      if (!r.ok) { setCheckpoints([]); return; }
      const json = await r.json() as { checkpoints?: Array<{ sha: string; shortSha: string; subject: string; createdAt: string; isAutomatic: boolean }> };
      setCheckpoints(json.checkpoints ?? []);
    } catch { setCheckpoints([]); } finally { setCheckpointsLoading(false); }
  }, []);

  const handleAddSecret = useCallback(async () => {
    if (!linkedBotId) return;
    const key = newSecretKey.trim();
    const value = newSecretValue;
    if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key)) {
      setSecretError("المفتاح يبدأ بحرف كبير أو _ ، ويتكوّن من حروف كبيرة/أرقام/_");
      return;
    }
    if (!value) { setSecretError("القيمة مطلوبة"); return; }
    setSecretError(null);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${linkedBotId}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string };
        setSecretError(j.error ?? `error ${r.status}`);
        return;
      }
      setNewSecretKey(""); setNewSecretValue("");
      void fetchSecrets(linkedBotId);
    } catch (e) { setSecretError((e as Error).message); }
  }, [linkedBotId, newSecretKey, newSecretValue, fetchSecrets]);

  const handleDeleteSecret = useCallback(async (key: string) => {
    if (!linkedBotId) return;
    if (!window.confirm(`حذف ${key}؟`)) return;
    try {
      await fetch(`${apiBase()}/api/bots/${linkedBotId}/secrets/${encodeURIComponent(key)}`, { method: "DELETE" });
      void fetchSecrets(linkedBotId);
    } catch { /* ignore */ }
  }, [linkedBotId, fetchSecrets]);

  const handleManualCheckpoint = useCallback(async () => {
    if (!linkedBotId) return;
    const message = window.prompt("وصف نقطة الحفظ (اختياري):", "Manual snapshot");
    if (message === null) return;
    try {
      await fetch(`${apiBase()}/api/bots/${linkedBotId}/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message || "Manual snapshot" }),
      });
      void fetchCheckpoints(linkedBotId);
    } catch { /* ignore */ }
  }, [linkedBotId, fetchCheckpoints]);

  const fetchUsage = useCallback(async (convId: number) => {
    try {
      const r = await fetch(`${apiBase()}/api/anthropic/conversations/${convId}/usage`);
      if (!r.ok) return;
      const j = await r.json() as { inputTokens: number; outputTokens: number; costSar: number; costUsd: number };
      setUsage({ inputTokens: j.inputTokens, outputTokens: j.outputTokens, costSar: j.costSar, costUsd: j.costUsd });
    } catch { /* ignore */ }
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (!linkedBotId || !selectedFile || !editorDirty) return;
    setSavingFile(true);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${linkedBotId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile.path, content: editorContent }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `error ${r.status}`);
      }
      setEditorDirty(false);
      setFileContent(editorContent);
      toast({ title: "تم الحفظ", description: selectedFile.path });
      void fetchTree(linkedBotId);
    } catch (e) {
      toast({ title: "فشل الحفظ", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingFile(false);
    }
  }, [linkedBotId, selectedFile, editorDirty, editorContent, toast, fetchTree]);

  const handleSearch = useCallback(async (q: string) => {
    if (!linkedBotId || q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${linkedBotId}/search?q=${encodeURIComponent(q)}`);
      if (!r.ok) { setSearchResults([]); return; }
      const j = await r.json() as { hits?: Array<{ path: string; line: number; snippet: string; matchStart: number; matchEnd: number }>; filesScanned?: number };
      setSearchResults(j.hits ?? []);
      setSearchScanned(j.filesScanned ?? 0);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, [linkedBotId]);

  const handleSearchResultClick = useCallback((path: string) => {
    if (!linkedBotId) return;
    setSearchOpen(false);
    setRightTab("files");
    void fetchFileContent(linkedBotId, path);
    const parts = path.split("/");
    const name = parts[parts.length - 1] ?? path;
    setSelectedFile({ name, path, type: "file", size: 0 });
    // open all parent dirs
    setOpenDirs(prev => {
      const next = new Set(prev);
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i] as string;
        next.add(acc);
      }
      return next;
    });
  }, [linkedBotId, fetchFileContent]);

  const handleRestoreCheckpoint = useCallback(async (sha: string) => {
    if (!linkedBotId) return;
    if (!window.confirm("استعادة هذه النقطة؟ (سيتم حفظ نسخة احتياطية من الحالة الحالية تلقائياً)")) return;
    setRestoringSha(sha);
    try {
      const r = await fetch(`${apiBase()}/api/bots/${linkedBotId}/checkpoints/${encodeURIComponent(sha)}/restore`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string };
        window.alert(j.error ?? `error ${r.status}`);
        return;
      }
      void fetchCheckpoints(linkedBotId);
      void fetchTree(linkedBotId);
      if (selectedFile) void fetchFileContent(linkedBotId, selectedFile.path);
    } catch (e) { window.alert((e as Error).message); }
    finally { setRestoringSha(null); }
  }, [linkedBotId, fetchCheckpoints, fetchTree, fetchFileContent, selectedFile]);

  // Initial tree load when conversation/bot changes
  useEffect(() => {
    if (linkedBotId) {
      void fetchTree(linkedBotId);
      void fetchLogs(linkedBotId);
      setSelectedFile(null);
      setFileContent("");
      setRecentlyTouched(new Set());
    } else {
      setFileTree([]);
      setBotLogs([]);
      setSecrets([]);
      setCheckpoints([]);
    }
  }, [linkedBotId, fetchTree, fetchLogs]);

  // Lazy load secrets/checkpoints on tab switch
  useEffect(() => {
    if (!linkedBotId) return;
    if (rightTab === "secrets") void fetchSecrets(linkedBotId);
    if (rightTab === "checkpoints") void fetchCheckpoints(linkedBotId);
  }, [rightTab, linkedBotId, fetchSecrets, fetchCheckpoints]);

  // Sync editor when the user switches files (always reset on path change).
  // When fileContent updates while user is editing the SAME file, preserve their edits.
  const lastSyncedPathRef = useRef<string | null>(null);
  useEffect(() => {
    const path = selectedFile?.path ?? null;
    if (path !== lastSyncedPathRef.current) {
      // File changed → adopt fresh content & reset dirty flag
      setEditorContent(fileContent);
      setEditorDirty(false);
      lastSyncedPathRef.current = path;
    } else if (!editorDirty) {
      // Same file, no unsaved edits → safe to absorb refreshed content
      setEditorContent(fileContent);
    }
    // If same file AND dirty → keep user edits intact (do nothing)
  }, [fileContent, selectedFile?.path, editorDirty]);

  // Fetch usage on conversation change
  useEffect(() => {
    if (activeConvId) {
      void fetchUsage(activeConvId);
    } else {
      setUsage(null);
    }
  }, [activeConvId, fetchUsage]);

  // Ctrl+S / Cmd+S to save current file (only when Files tab + file selected + dirty).
  // Ctrl/Cmd+Shift+F → open global search (only when a bot is linked).
  // Both guards check the active element so we never hijack typing in other inputs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const isTypingInForm = tag === "TEXTAREA" || (tag === "INPUT" && (document.activeElement as HTMLInputElement).type !== "button");
      // Save: only intercept if the editor tab is open with unsaved changes
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        if (rightTab === "files" && selectedFile && editorDirty) {
          e.preventDefault();
          void handleSaveFile();
        }
      }
      // Search: don't intercept while user is typing a Shift+F in a form field by accident
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f" && linkedBotId && !isTypingInForm) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rightTab, selectedFile, editorDirty, handleSaveFile, linkedBotId]);

  // Refresh tree + checkpoints after streaming ends + track touched files for highlight
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !streaming && linkedBotId) {
      void fetchTree(linkedBotId);
      void fetchLogs(linkedBotId);
      // Auto-snapshot may have happened — refresh if visible
      if (rightTab === "checkpoints") void fetchCheckpoints(linkedBotId);
      // Refresh selected file content if agent might have changed it
      if (selectedFile) {
        void fetchFileContent(linkedBotId, selectedFile.path);
      }
    }
    wasStreamingRef.current = streaming;
  }, [streaming, linkedBotId, rightTab, fetchTree, fetchLogs, fetchCheckpoints, fetchFileContent, selectedFile]);

  // Track files the agent just touched (highlight in tree)
  useEffect(() => {
    const lastResult = [...streamingEvents].reverse().find(
      (e): e is Extract<StreamEvent, { type: "tool_result" }> => e.type === "tool_result",
    );
    if (!lastResult) return;
    if (!["write_file", "delete_file", "write_bot_file"].includes(lastResult.name)) return;
    const matchingRunning = streamingEvents.find(
      (e): e is Extract<StreamEvent, { type: "tool_running" }> =>
        e.type === "tool_running" && e.id === lastResult.id,
    );
    const path = matchingRunning?.input["path"];
    if (typeof path === "string" && path.trim()) {
      setRecentlyTouched(prev => {
        const next = new Set(prev);
        next.add(path);
        // Bubble up to parent dirs (cheap, bounded by path depth)
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
        // Cap to 50 entries — drop oldest insertions if exceeded
        if (next.size > 50) {
          const trimmed = Array.from(next).slice(-50);
          return new Set(trimmed);
        }
        return next;
      });
      // Clear individual highlight after 8s
      setTimeout(() => {
        setRecentlyTouched(prev => {
          if (!prev.has(path)) return prev;
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }, 8000);
    }
  }, [streamingEvents]);

  // Poll bot logs every 2s when bot is running
  useEffect(() => {
    if (!linkedBotId) return;
    const bot = botsData.find(b => b.id === linkedBotId);
    if (bot?.status !== "running") return;
    const interval = setInterval(() => { void fetchLogs(linkedBotId); }, 2500);
    return () => clearInterval(interval);
  }, [linkedBotId, botsData, fetchLogs]);

  // Auto-scroll log panel to bottom on new logs
  useEffect(() => {
    if (rightTab === "logs" && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [botLogs, rightTab]);

  const toggleDir = useCallback((path: string) => {
    setOpenDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const handleSelectFile = useCallback((node: TreeNode) => {
    setSelectedFile(node);
    if (linkedBotId) void fetchFileContent(linkedBotId, node.path);
  }, [linkedBotId, fetchFileContent]);

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
          } else if (json.type === "usage") {
            setUsage(prev => ({
              inputTokens: (prev?.inputTokens ?? 0) + (json["inputTokens"] as number ?? 0),
              outputTokens: (prev?.outputTokens ?? 0) + (json["outputTokens"] as number ?? 0),
              costSar: (prev?.costSar ?? 0) + (json["costSar"] as number ?? 0),
              costUsd: (prev?.costUsd ?? 0) + (json["costUsd"] as number ?? 0),
            }));
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

  const linkedBotForPanel = linkedBotId ? botsData.find(b => b.id === linkedBotId) : null;
  const showRightPanel = !!activeConvId && !!linkedBotForPanel;

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
                  {usage && (usage.inputTokens > 0 || usage.outputTokens > 0) && (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono"
                      title={`Input: ${usage.inputTokens.toLocaleString("en-US")} tokens · Output: ${usage.outputTokens.toLocaleString("en-US")} tokens · ≈ $${usage.costUsd.toFixed(4)}`}
                      dir="ltr"
                    >
                      <Coins className="w-3 h-3 text-amber-600" />
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">
                        {usage.costSar < 0.01 ? "<0.01" : usage.costSar.toFixed(2)} SAR
                      </span>
                      <span className="text-muted-foreground/60">
                        ({((usage.inputTokens + usage.outputTokens) / 1000).toFixed(1)}K tok)
                      </span>
                    </div>
                  )}
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

        {showRightPanel && linkedBotForPanel && (
          <div className="w-80 border-l border-border/50 flex flex-col bg-muted/10 flex-shrink-0">
            <div className="flex border-b border-border/50 bg-background/50">
              <button
                type="button"
                onClick={() => setRightTab("files")}
                className={cn(
                  "flex-1 px-3 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  rightTab === "files"
                    ? "bg-background text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FolderTree className="w-3.5 h-3.5" />
                الملفات
                {fileTree.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/60">({fileTree.length})</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setRightTab("logs")}
                className={cn(
                  "flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  rightTab === "logs"
                    ? "bg-background text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ScrollText className="w-3.5 h-3.5" />
                السجلات
                {linkedBotForPanel.status === "running" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setRightTab("secrets")}
                className={cn(
                  "flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  rightTab === "secrets"
                    ? "bg-background text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Key className="w-3.5 h-3.5" />
                الأسرار
              </button>
              <button
                type="button"
                onClick={() => setRightTab("checkpoints")}
                className={cn(
                  "flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  rightTab === "checkpoints"
                    ? "bg-background text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <History className="w-3.5 h-3.5" />
                الحفظ
              </button>
              {linkedBotForPanel && ["website", "game", "web-app"].includes(((linkedBotForPanel as unknown) as { projectType?: string }).projectType ?? "") && (
                <button
                  type="button"
                  onClick={() => setRightTab("preview")}
                  className={cn(
                    "flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                    rightTab === "preview"
                      ? "bg-background text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  معاينة
                </button>
              )}
            </div>

            {rightTab === "files" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    شجرة المشروع
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title="بحث (Ctrl+Shift+F)"
                    >
                      <Search className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => linkedBotId && void fetchTree(linkedBotId)}
                      disabled={treeLoading}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title="تحديث"
                    >
                      <RefreshCw className={cn("w-3 h-3", treeLoading && "animate-spin")} />
                    </button>
                  </div>
                </div>
                <ScrollArea className="flex-1 max-h-[40%]">
                  <div className="py-1">
                    {fileTree.length === 0 && !treeLoading && (
                      <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center">
                        لا توجد ملفات بعد. اطلب من الوكيل البدء في البناء.
                      </p>
                    )}
                    {fileTree.map(node => (
                      <FileTreeNode
                        key={node.path || node.name}
                        node={node}
                        depth={0}
                        openDirs={openDirs}
                        toggleDir={toggleDir}
                        selectedPath={selectedFile?.path ?? null}
                        recentlyTouched={recentlyTouched}
                        onSelectFile={handleSelectFile}
                      />
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex-1 min-h-0 border-t border-border/50 flex flex-col bg-background/40">
                  {selectedFile ? (
                    <>
                      <div className="px-3 py-1.5 border-b border-border/30 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono truncate text-foreground/80 flex items-center gap-1" dir="ltr">
                          {editorDirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" title="تغييرات غير محفوظة" />}
                          {selectedFile.path}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[9px] text-muted-foreground/60 ltr-text">
                            {formatBytes(selectedFile.size)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant={editorDirty ? "default" : "outline"}
                            disabled={!editorDirty || savingFile}
                            onClick={() => void handleSaveFile()}
                            className="h-6 text-[10px] px-2 gap-1"
                            title="Ctrl+S"
                          >
                            <Save className="w-3 h-3" />
                            {savingFile ? "..." : "حفظ"}
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0">
                        {contentLoading && (
                          <p className="px-3 py-4 text-xs text-muted-foreground">جاري التحميل...</p>
                        )}
                        {contentError && (
                          <p className="px-3 py-4 text-xs text-destructive" dir="ltr">{contentError}</p>
                        )}
                        {!contentLoading && !contentError && (
                          <Editor
                            height="100%"
                            language={monacoLanguageFromPath(selectedFile.path)}
                            value={editorContent}
                            theme="vs-dark"
                            onChange={(v) => {
                              const next = v ?? "";
                              setEditorContent(next);
                              setEditorDirty(next !== fileContent);
                            }}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 12,
                              lineNumbers: "on",
                              wordWrap: "on",
                              scrollBeyondLastLine: false,
                              tabSize: 2,
                              automaticLayout: true,
                            }}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center px-4 text-center">
                      <p className="text-xs text-muted-foreground/60">
                        اختر ملفاً من الشجرة أعلاه لمعاينة محتواه
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {rightTab === "logs" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      سجلات البوت
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">
                      {linkedBotForPanel.status === "running" ? "نشط" :
                       linkedBotForPanel.status === "stopped" ? "متوقف" :
                       linkedBotForPanel.status === "crashed" ? "تعطّل" : linkedBotForPanel.status}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => linkedBotId && void fetchLogs(linkedBotId)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                    title="تحديث"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <div ref={logScrollRef} className="flex-1 overflow-y-auto bg-background/60 font-mono text-[10px]">
                  {botLogs.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center font-sans">
                      لا توجد سجلات بعد. شغّل البوت لرؤية الإخراج المباشر.
                    </p>
                  ) : (
                    <div className="py-1">
                      {botLogs.slice(-200).map((l, i) => (
                        <div
                          key={i}
                          dir="ltr"
                          className={cn(
                            "px-3 py-0.5 leading-relaxed border-b border-border/10",
                            l.level === "error" ? "text-red-500/90 bg-red-500/5" : "text-foreground/75"
                          )}
                        >
                          <span className="text-muted-foreground/50 me-2">
                            {new Date(l.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                          </span>
                          <span className="whitespace-pre-wrap break-words">{l.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {rightTab === "secrets" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    متغيّرات البيئة
                  </span>
                  <button
                    type="button"
                    onClick={() => linkedBotId && void fetchSecrets(linkedBotId)}
                    disabled={secretsLoading}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                    title="تحديث"
                  >
                    <RefreshCw className={cn("w-3 h-3", secretsLoading && "animate-spin")} />
                  </button>
                </div>
                <div className="px-3 py-2 border-b border-border/30 space-y-1.5 bg-background/40">
                  <input
                    type="text"
                    placeholder="API_KEY"
                    value={newSecretKey}
                    onChange={e => setNewSecretKey(e.target.value.toUpperCase())}
                    dir="ltr"
                    className="w-full text-[11px] font-mono px-2 py-1 rounded border border-border/60 bg-background"
                  />
                  <input
                    type="password"
                    placeholder="القيمة (لن تظهر مرّة ثانية)"
                    value={newSecretValue}
                    onChange={e => setNewSecretValue(e.target.value)}
                    dir="ltr"
                    className="w-full text-[11px] font-mono px-2 py-1 rounded border border-border/60 bg-background"
                  />
                  {secretError && (
                    <p className="text-[10px] text-destructive">{secretError}</p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleAddSecret()}
                    disabled={!newSecretKey || !newSecretValue}
                    className="w-full h-7 text-[11px]"
                  >
                    <Key className="w-3 h-3 me-1" />
                    إضافة سر
                  </Button>
                  <p className="text-[9px] text-muted-foreground/60 leading-tight">
                    الأسرار مشفّرة على القرص (AES-256-GCM) وتُحقن كـ env vars عند تشغيل البوت.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {secrets.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center">
                      لا توجد أسرار بعد. أضف مفتاح API أو توكن.
                    </p>
                  ) : (
                    <div className="py-1">
                      {secrets.map(s => (
                        <div key={s.key} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/20 hover:bg-muted/30">
                          <div className="flex-1 min-w-0" dir="ltr">
                            <div className="text-[11px] font-mono font-medium truncate">{s.key}</div>
                            <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                              {s.preview} <span className="text-muted-foreground/40">({s.length})</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSecret(s.key)}
                            className="flex-shrink-0 text-muted-foreground hover:text-destructive p-1 rounded"
                            title="حذف"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {rightTab === "checkpoints" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    نقاط الحفظ
                    {checkpoints.length > 0 && (
                      <span className="ms-1 text-muted-foreground/60 normal-case">({checkpoints.length})</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleManualCheckpoint()}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title="حفظ الآن"
                    >
                      <Sparkles className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => linkedBotId && void fetchCheckpoints(linkedBotId)}
                      disabled={checkpointsLoading}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title="تحديث"
                    >
                      <RefreshCw className={cn("w-3 h-3", checkpointsLoading && "animate-spin")} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {checkpoints.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center">
                      لا توجد نقاط حفظ بعد. ستُحفظ تلقائياً بعد كل دور للوكيل.
                    </p>
                  ) : (
                    <div className="py-1">
                      {checkpoints.map(c => (
                        <div key={c.sha} className="px-3 py-2 border-b border-border/20 hover:bg-muted/30 group">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <code className="text-[10px] text-muted-foreground/70 font-mono" dir="ltr">{c.shortSha}</code>
                                {c.isAutomatic && (
                                  <span className="text-[9px] px-1 py-px rounded bg-primary/10 text-primary/80">تلقائي</span>
                                )}
                              </div>
                              <div className="text-[11px] text-foreground/85 truncate" title={c.subject}>
                                {c.subject}
                              </div>
                              <div className="text-[9px] text-muted-foreground/60 mt-0.5" dir="ltr">
                                {new Date(c.createdAt).toLocaleString("en-US", { hour12: false })}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRestoreCheckpoint(c.sha)}
                              disabled={restoringSha !== null}
                              className="flex-shrink-0 text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                              title="استعادة"
                            >
                              {restoringSha === c.sha ? (
                                <RotateCw className="w-3 h-3 animate-spin" />
                              ) : (
                                "استعادة"
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {rightTab === "preview" && linkedBotForPanel && (
              <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-background/40">
                  <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
                    {([
                      { key: "desktop", icon: Monitor, label: "سطح المكتب", w: 1280 },
                      { key: "tablet",  icon: Tablet,  label: "لوحي", w: 768 },
                      { key: "mobile",  icon: Smartphone, label: "جوال", w: 390 },
                    ] as const).map(({ key, icon: Icon, label, w }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPreviewDevice(key)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors",
                          previewDevice === key
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        title={`${label} · ${w}px`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{w}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewKey(k => k + 1)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title="إعادة تحميل"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
                        window.open(`${BASE}/api/preview/${linkedBotForPanel.id}`, "_blank", "noopener,noreferrer");
                      }}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title="فتح في نافذة جديدة"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center p-3">
                  {(() => {
                    const widths = { desktop: 1280, tablet: 768, mobile: 390 } as const;
                    const heights = { desktop: 800, tablet: 1024, mobile: 844 } as const;
                    const w = widths[previewDevice];
                    const h = heights[previewDevice];
                    const isDevice = previewDevice !== "desktop";
                    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
                    return (
                      <div
                        className={cn(
                          "bg-white rounded-md shadow-lg overflow-hidden flex-shrink-0 origin-top",
                          isDevice && "ring-2 ring-foreground/20 ring-offset-2 ring-offset-muted/20"
                        )}
                        style={{
                          width: w,
                          height: h,
                          transform: "scale(var(--preview-scale, 1))",
                          transformOrigin: "top center",
                        }}
                        ref={(el) => {
                          if (!el) return;
                          const parent = el.parentElement;
                          if (!parent) return;
                          const avail = parent.clientWidth - 24;
                          const scale = avail < w ? Math.max(0.2, avail / w) : 1;
                          el.style.setProperty("--preview-scale", String(scale));
                          el.style.marginBottom = `${h * (scale - 1)}px`;
                        }}
                      >
                        <iframe
                          key={previewKey}
                          src={`${BASE}/api/preview/${linkedBotForPanel.id}`}
                          className="w-full h-full border-0"
                          title={`Preview of ${linkedBotForPanel.name}`}
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
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

      {/* Global file search dialog */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-background border border-border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  void handleSearch(v);
                }}
                onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
                placeholder="ابحث في كل ملفات المشروع... (حرفان على الأقل)"
                className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/60"
                dir="auto"
              />
              {searchLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">ESC</kbd>
            </div>
            <ScrollArea className="max-h-[60vh]">
              {searchQuery.length < 2 && (
                <p className="px-4 py-8 text-xs text-center text-muted-foreground/60">
                  اكتب كلمة للبحث في جميع ملفات البوت (يتم تجاهل node_modules و .git)
                </p>
              )}
              {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
                <p className="px-4 py-8 text-xs text-center text-muted-foreground/60">
                  لا توجد نتائج · فُحص {searchScanned} ملف
                </p>
              )}
              {searchResults.length > 0 && (
                <>
                  <p className="px-4 py-1.5 text-[10px] text-muted-foreground/60 border-b border-border/30 bg-muted/20">
                    {searchResults.length} نتيجة في {searchScanned} ملف
                  </p>
                  <div className="divide-y divide-border/30">
                    {searchResults.map((hit, i) => (
                      <button
                        key={`${hit.path}-${hit.line}-${i}`}
                        type="button"
                        onClick={() => handleSearchResultClick(hit.path)}
                        className="w-full text-right px-4 py-2 hover:bg-primary/5 transition-colors block"
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-mono text-primary truncate" dir="ltr">
                            {hit.path}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60 ltr-text flex-shrink-0">
                            line {hit.line}
                          </span>
                        </div>
                        <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre overflow-hidden text-ellipsis" dir="ltr">
                          {hit.snippet.slice(0, hit.matchStart)}
                          <span className="bg-amber-500/30 text-amber-900 dark:text-amber-200 rounded px-0.5">
                            {hit.snippet.slice(hit.matchStart, hit.matchEnd)}
                          </span>
                          {hit.snippet.slice(hit.matchEnd)}
                        </pre>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </Layout>
  );
}
