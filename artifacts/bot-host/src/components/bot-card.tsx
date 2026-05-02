import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow, type Locale } from "date-fns";
import { ar, enUS, es, fr, de, zhCN, ja, ru } from "date-fns/locale";
import {
  Bot,
  useStartBot,
  useStopBot,
  useRestartBot,
  useDeleteBot,
  getListBotsQueryKey,
  getGetBotsStatsQueryKey,
  BotStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play, Square, RotateCw, Trash2, TerminalSquare, AlertTriangle,
  FileCode2, Download, Code2, Eye,
  Bot as BotIcon, Globe, Gamepad2, LayoutDashboard, ServerCog,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ExportGithubDialog } from "./export-github-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const DATE_LOCALES: Record<string, Locale> = {
  ar, en: enUS, es, fr, de, zh: zhCN, ja, ru,
};

const PROJECT_ICON: Record<string, typeof Globe> = {
  "discord-bot": BotIcon,
  "website": Globe,
  "game": Gamepad2,
  "web-app": LayoutDashboard,
  "api-server": ServerCog,
  "python-script": FileCode2,
};

const PROJECT_COLOR: Record<string, { color: string; bg: string }> = {
  "discord-bot":   { color: "#5865F2", bg: "#EEF0FF" },
  "website":       { color: "#0EA5E9", bg: "#E0F2FE" },
  "game":          { color: "#EC4899", bg: "#FCE7F3" },
  "web-app":       { color: "#10B981", bg: "#D1FAE5" },
  "api-server":    { color: "#F59E0B", bg: "#FEF3C7" },
  "python-script": { color: "#6366F1", bg: "#E0E7FF" },
};

interface BotCardProps {
  bot: Bot & { projectType?: string };
}

export function BotCard({ bot }: BotCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();
  const deleteBot = useDeleteBot();

  const projectType = bot.projectType ?? "discord-bot";
  const Icon = PROJECT_ICON[projectType] ?? BotIcon;
  const tag = PROJECT_COLOR[projectType] ?? PROJECT_COLOR["discord-bot"];
  const isWebProject = ["website", "game", "web-app"].includes(projectType);

  const STATUS_LABELS: Record<BotStatus, string> = {
    running: t("dashboard.stats.running"),
    stopped: t("dashboard.stats.stopped"),
    crashed: t("dashboard.stats.crashed"),
    starting: t("dashboard.stats.running"),
  };

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
  };

  const handleAction = (action: any, actionName: string) => {
    action.mutate({ id: bot.id }, {
      onSuccess: () => {
        toast({ title: "✓", description: `${bot.name} — ${actionName}.` });
        invalidateQueries();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed", variant: "destructive" });
      },
    });
  };

  const statusColors: Record<BotStatus, { bg: string; text: string; border: string }> = {
    running: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    stopped: { bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200" },
    crashed: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
    starting: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  };
  const colors = statusColors[bot.status];
  const dateLocale = DATE_LOCALES[i18n.language] ?? enUS;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: tag.bg }}
          >
            <Icon className="w-5 h-5" style={{ color: tag.color }} />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base text-foreground truncate">{bot.name}</h3>
              <Badge variant="outline" className={`text-xs font-medium ${colors.bg} ${colors.text} ${colors.border} shrink-0`}>
                {bot.status === "running" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mx-1 animate-pulse" />}
                {bot.status === "crashed" && <AlertTriangle className="w-3 h-3 mx-1" />}
                {STATUS_LABELS[bot.status]}
              </Badge>
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1.5 flex-wrap">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ background: tag.bg, color: tag.color }}
              >
                {t(`projectTypes.${projectType}`)}
              </span>
              <FileCode2 className="w-3 h-3" />
              <span className="font-mono truncate max-w-[120px]">{bot.filename}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isWebProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`${basePath}/api/preview/${bot.id}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md"
                >
                  <Eye className="w-3.5 h-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Preview</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <a href={`/api/bots/${bot.id}/download`} download>
                <Button variant="ghost" size="sm" className="px-2 text-muted-foreground hover:text-foreground h-8 w-8">
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>

          <ExportGithubDialog botId={bot.id} botName={bot.name} botFilename={bot.filename} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`${basePath}/bots/${bot.id}/editor`} className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md">
                <Code2 className="w-3.5 h-3.5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>{t("common.edit")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`${basePath}/bots/${bot.id}/logs`} className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md">
                <TerminalSquare className="w-3.5 h-3.5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Logs</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 my-3 p-3 bg-muted/40 rounded-lg border border-border/60 text-sm">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground mb-0.5 font-semibold uppercase tracking-wider">
            {t("dashboard.stats.running")}
          </span>
          <span className="font-mono text-sm text-foreground/90">
            {bot.status === "running" && bot.startedAt
              ? formatDistanceToNow(new Date(bot.startedAt), { addSuffix: false, locale: dateLocale })
              : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground mb-0.5 font-semibold uppercase tracking-wider">
            {t("dashboard.stats.restarts")}
          </span>
          <span className="font-mono text-sm text-foreground/90">{bot.restartCount}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 pt-3 border-t border-border/50">
        {bot.status !== "running" && bot.status !== "starting" ? (
          <Button
            variant="default"
            size="sm"
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleAction(startBot, "started")}
            disabled={startBot.isPending}
          >
            <Play className="w-3.5 h-3.5 mx-1" /> {t("common.create")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => handleAction(stopBot, "stopped")}
            disabled={stopBot.isPending}
          >
            <Square className="w-3.5 h-3.5 mx-1" /> Stop
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => handleAction(restartBot, "restarted")}
          disabled={restartBot.isPending}
        >
          <RotateCw className={`w-3.5 h-3.5 mx-1 ${restartBot.isPending ? "animate-spin" : ""}`} /> Restart
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="px-3 text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.delete")} {bot.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleAction(deleteBot, "deleted")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
