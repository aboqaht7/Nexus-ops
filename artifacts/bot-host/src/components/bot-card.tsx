import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Bot,
  useStartBot,
  useStopBot,
  useRestartBot,
  useDeleteBot,
  getListBotsQueryKey,
  getGetBotsStatsQueryKey,
  BotStatus
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Square, RotateCw, Trash2, TerminalSquare, AlertTriangle, FileCode2, Download, Code2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ExportGithubDialog } from "./export-github-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_LABELS: Record<BotStatus, string> = {
  running: "يعمل",
  stopped: "متوقف",
  crashed: "تعطّل",
  starting: "يبدأ",
};

interface BotCardProps {
  bot: Bot;
}

export function BotCard({ bot }: BotCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();
  const deleteBot = useDeleteBot();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
  };

  const handleAction = (action: any, actionName: string) => {
    action.mutate({ id: bot.id }, {
      onSuccess: () => {
        toast({ title: "تم", description: `البوت ${bot.name} — ${actionName}.` });
        invalidateQueries();
      },
      onError: (err: any) => {
        toast({ title: "خطأ", description: err.message || "فشل تنفيذ الأمر", variant: "destructive" });
      }
    });
  };

  const statusColors: Record<BotStatus, { bg: string; text: string; border: string }> = {
    running: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    stopped: { bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200" },
    crashed: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
    starting: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  };

  const colors = statusColors[bot.status];

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base text-foreground truncate">{bot.name}</h3>
            <Badge variant="outline" className={`text-xs font-medium ${colors.bg} ${colors.text} ${colors.border} shrink-0`}>
              {bot.status === "running" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1.5 animate-pulse" />}
              {bot.status === "crashed" && <AlertTriangle className="w-3 h-3 ml-1" />}
              {STATUS_LABELS[bot.status]}
            </Badge>
          </div>
          <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1.5">
            <FileCode2 className="w-3 h-3" />
            <span className="font-mono truncate max-w-[120px]">{bot.filename}</span>
            <span className="text-border">·</span>
            <span className="capitalize font-medium text-foreground/60 bg-secondary px-1.5 py-0.5 rounded-md text-[11px]">
              {bot.language}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={`/api/bots/${bot.id}/download`} download>
                <Button variant="ghost" size="sm" className="px-2 text-muted-foreground hover:text-foreground h-8 w-8">
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent>تنزيل الملف</TooltipContent>
          </Tooltip>

          <ExportGithubDialog botId={bot.id} botName={bot.name} botFilename={bot.filename} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`${basePath}/bots/${bot.id}/editor`} className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md">
                <Code2 className="w-3.5 h-3.5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>تعديل الكود</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`${basePath}/bots/${bot.id}/logs`} className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md">
                <TerminalSquare className="w-3.5 h-3.5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>السجلات</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 my-3 p-3 bg-muted/40 rounded-lg border border-border/60 text-sm">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground mb-0.5 font-semibold uppercase tracking-wider">مدة التشغيل</span>
          <span className="font-mono text-sm text-foreground/90">
            {bot.status === "running" && bot.startedAt
              ? formatDistanceToNow(new Date(bot.startedAt), { addSuffix: false, locale: ar })
              : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground mb-0.5 font-semibold uppercase tracking-wider">إعادات التشغيل</span>
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
            onClick={() => handleAction(startBot, "جارٍ التشغيل")}
            disabled={startBot.isPending}
          >
            <Play className="w-3.5 h-3.5 ml-1.5" /> تشغيل
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => handleAction(stopBot, "جارٍ الإيقاف")}
            disabled={stopBot.isPending}
          >
            <Square className="w-3.5 h-3.5 ml-1.5" /> إيقاف
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => handleAction(restartBot, "جارٍ إعادة التشغيل")}
          disabled={restartBot.isPending}
        >
          <RotateCw className={`w-3.5 h-3.5 ml-1.5 ${restartBot.isPending ? "animate-spin" : ""}`} /> إعادة
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="px-3 text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف {bot.name}؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إيقاف البوت وحذف ملفاته نهائياً. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleAction(deleteBot, "تم الحذف")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
