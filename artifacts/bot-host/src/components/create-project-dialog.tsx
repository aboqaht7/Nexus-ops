import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getListBotsQueryKey,
  getGetBotsStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Plus, Bot as BotIcon, Globe, Gamepad2, LayoutDashboard,
  ServerCog, FileCode2, Loader2, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type ProjectType =
  | "discord-bot" | "website" | "game" | "web-app" | "api-server" | "python-script";

interface TypeCard {
  id: ProjectType;
  Icon: typeof Globe;
  color: string;
  bg: string;
  language?: "javascript" | "python";
  needsLanguage?: boolean;
}

const TYPE_CARDS: TypeCard[] = [
  { id: "discord-bot", Icon: BotIcon, color: "#5865F2", bg: "#EEF0FF", needsLanguage: true },
  { id: "website",     Icon: Globe,   color: "#0EA5E9", bg: "#E0F2FE" },
  { id: "game",        Icon: Gamepad2,color: "#EC4899", bg: "#FCE7F3" },
  { id: "web-app",     Icon: LayoutDashboard, color: "#10B981", bg: "#D1FAE5" },
  { id: "api-server",  Icon: ServerCog,color: "#F59E0B", bg: "#FEF3C7", needsLanguage: true },
  { id: "python-script", Icon: FileCode2, color: "#6366F1", bg: "#E0E7FF" },
];

export function CreateProjectDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const [, navigate] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"type" | "details">("type");
  const [type, setType] = useState<ProjectType>("discord-bot");
  const [language, setLanguage] = useState<"javascript" | "python">("javascript");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  function reset() {
    setStep("type");
    setName("");
    setType("discord-bot");
    setLanguage("javascript");
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast({ title: t("createProject.namePlaceholder"), variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${apiBase}/bots/create-from-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          projectType: type,
          language,
          code: "", // server fills in starter template
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed");
      }
      const bot = await resp.json();
      qc.invalidateQueries({ queryKey: getListBotsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
      toast({ title: "✓", description: name.trim() });
      setOpen(false);
      reset();
      navigate(`${basePath}/bots/${bot.id}/editor`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  const selectedCard = TYPE_CARDS.find((c) => c.id === type)!;
  const needsLang = selectedCard.needsLanguage === true;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" />
          {t("dashboard.newProject")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("createProject.title")}</DialogTitle>
          <DialogDescription>{t("createProject.subtitle")}</DialogDescription>
        </DialogHeader>

        {step === "type" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {TYPE_CARDS.map(({ id, Icon, color, bg }) => {
              const active = type === id;
              return (
                <button
                  key={id}
                  onClick={() => { setType(id); }}
                  className={cn(
                    "group relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-start transition-all hover:shadow-md",
                    active ? "border-primary shadow-sm" : "border-border hover:border-primary/40",
                  )}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: bg }}
                  >
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    {t(`projectTypes.${id}`)}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(`projectTypes.${id}.desc`)}
                  </div>
                </button>
              );
            })}
            <div className="col-span-2 sm:col-span-3 flex justify-end mt-2">
              <Button onClick={() => setStep("details")} className="gap-2">
                {t("common.next")} <Sparkles className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: selectedCard.bg }}
              >
                <selectedCard.Icon className="w-5 h-5" style={{ color: selectedCard.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{t(`projectTypes.${type}`)}</div>
                <div className="text-xs text-muted-foreground truncate">{t(`projectTypes.${type}.desc`)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep("type")}>
                {t("common.back")}
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t("createProject.namePlaceholder")}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-awesome-project"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              />
            </div>

            {needsLang && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["javascript", "python"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={cn(
                        "px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                        language === l
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {l === "javascript" ? "JavaScript" : "Python"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {t("createProject.createBtn")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
