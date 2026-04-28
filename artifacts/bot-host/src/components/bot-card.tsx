import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
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
        toast({ title: `Command Sent`, description: `Bot ${bot.name} is ${actionName}.` });
        invalidateQueries();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || `Failed to ${actionName} bot`, variant: "destructive" });
      }
    });
  };

  const statusColors: Record<BotStatus, { bg: string, text: string, border: string }> = {
    running: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
    stopped: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
    crashed: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/20" },
    starting: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20" }
  };

  const colors = statusColors[bot.status];

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/20 flex flex-col group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg text-foreground tracking-tight">{bot.name}</h3>
            <Badge variant="outline" className={`ml-2 text-xs font-mono uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border}`}>
              {bot.status === "running" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />}
              {bot.status === "crashed" && <AlertTriangle className="w-3 h-3 mr-1" />}
              {bot.status}
            </Badge>
          </div>
          <div className="flex items-center text-sm text-muted-foreground mt-1 gap-1.5">
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="font-mono text-xs">{bot.filename}</span>
            <span className="text-border mx-1">•</span>
            <span className="capitalize text-xs font-medium text-foreground/70 bg-secondary px-1.5 py-0.5 rounded">
              {bot.language}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={`/api/bots/${bot.id}/download`} download>
                <Button variant="ghost" size="sm" className="px-2 text-muted-foreground hover:text-foreground">
                  <Download className="w-4 h-4" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent>Download file</TooltipContent>
          </Tooltip>

          <ExportGithubDialog botId={bot.id} botName={bot.name} botFilename={bot.filename} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`/bots/${bot.id}/editor`} className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md">
                <Code2 className="w-4 h-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Edit code</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`/bots/${bot.id}/logs`} className="text-muted-foreground hover:text-primary transition-colors bg-secondary/50 hover:bg-secondary p-2 rounded-md">
                <TerminalSquare className="w-4 h-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>View logs</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 my-4 p-3 bg-muted/30 rounded-lg border border-border/50 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wider">Uptime</span>
          <span className="font-mono text-foreground/90">
            {bot.status === "running" && bot.startedAt 
              ? formatDistanceToNow(new Date(bot.startedAt), { addSuffix: false }) 
              : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wider">Restarts</span>
          <span className="font-mono text-foreground/90">{bot.restartCount}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-2 border-t border-border/50">
        {bot.status !== "running" && bot.status !== "starting" ? (
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleAction(startBot, "starting")}
            disabled={startBot.isPending}
          >
            <Play className="w-4 h-4 mr-1.5" /> Start
          </Button>
        ) : (
          <Button 
            variant="secondary" 
            size="sm" 
            className="flex-1"
            onClick={() => handleAction(stopBot, "stopping")}
            disabled={stopBot.isPending}
          >
            <Square className="w-4 h-4 mr-1.5" /> Stop
          </Button>
        )}
        
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={() => handleAction(restartBot, "restarting")}
          disabled={restartBot.isPending}
        >
          <RotateCw className={`w-4 h-4 mr-1.5 ${restartBot.isPending ? 'animate-spin' : ''}`} /> Restart
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="px-3 text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20">
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently stop the bot and delete its source files. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => handleAction(deleteBot, "deleted")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
