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
  Trash2,
  Send,
  Sparkles,
  Copy,
  Rocket,
  Code2,
  MessageSquare,
  ChevronRight,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CodeBlock {
  lang: string;
  code: string;
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

interface MessageBubbleProps {
  message: AnthropicMessage | { role: string; content: string; id?: number; streaming?: boolean };
  onDeploy: (code: string, lang: string) => void;
}

function MessageBubble({ message, onDeploy }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const segments = parseMessage(message.content);

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
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{message.content}</p>
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
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
  }, [activeConv?.messages, streamingContent]);

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

  const handleDeleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConv.mutateAsync({ id });
    if (activeConvId === id) setActiveConvId(null);
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeConvId || streaming) return;

    const message = input.trim();
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${BASE}/api/anthropic/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
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
          try {
            const json = JSON.parse(line.slice(6));
            if (json.content) {
              setStreamingContent((prev) => prev + json.content);
            }
            if (json.done) {
              qc.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(activeConvId) });
              setStreamingContent("");
            }
            if (json.error) {
              throw new Error(json.error);
            }
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast({ title: "خطأ", description: (err as Error).message, variant: "destructive" });
        setStreamingContent("");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, activeConvId, streaming, qc, toast]);

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
                {streaming && (
                  <Badge variant="secondary" className="text-xs animate-pulse">
                    <Sparkles className="w-3 h-3 ml-1" />
                    الوكيل يفكر...
                  </Badge>
                )}
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

                  {streaming && streamingContent && (
                    <MessageBubble
                      message={{ role: "assistant", content: streamingContent, streaming: true }}
                      onDeploy={handleDeployClick}
                    />
                  )}

                  {streaming && !streamingContent && (
                    <div className="flex gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-primary animate-spin" />
                      </div>
                      <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="px-4 pb-4 pt-2 border-t border-border/50 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="صف بوتك، اطلب إصلاح الكود، أضف ميزات... (Enter للإرسال، Shift+Enter لسطر جديد)"
                    className="min-h-[60px] max-h-[160px] resize-none text-sm"
                    disabled={streaming}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim() || streaming}
                    className="flex-shrink-0 h-[60px] w-10"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-1">
                  Agent-4 مدعوم بـ Claude Sonnet · قد تحتوي الردود على كود جاهز للنشر
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
