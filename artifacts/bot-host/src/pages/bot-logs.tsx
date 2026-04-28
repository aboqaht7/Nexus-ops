import { useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useGetBot, useGetBotLogs, getGetBotQueryKey, getGetBotLogsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { ArrowLeft, TerminalSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function BotLogs() {
  const { id } = useParams<{ id: string }>();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: bot, isLoading: isBotLoading } = useGetBot(id!, {
    query: { enabled: !!id, queryKey: getGetBotQueryKey(id!) }
  });

  const { data: logsData, isLoading: isLogsLoading } = useGetBotLogs(id!, {
    query: { 
      enabled: !!id, 
      queryKey: getGetBotLogsQueryKey(id!),
      refetchInterval: 2000 // Poll logs every 2 seconds
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logsData?.logs]);

  return (
    <Layout>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" asChild className="h-9 w-9">
          <Link href="/">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TerminalSquare className="w-5 h-5 text-primary" />
            {isBotLoading ? <Skeleton className="h-6 w-32 inline-block" /> : bot?.name}
            <span className="text-muted-foreground font-normal text-lg">/ logs</span>
          </h1>
        </div>
      </div>

      <div className="bg-[#0c0c0e] border border-border/80 rounded-xl overflow-hidden shadow-xl flex flex-col h-[calc(100vh-200px)]">
        <div className="bg-muted/40 border-b border-border/60 px-4 py-2.5 flex items-center justify-between text-xs font-mono text-muted-foreground">
          <span>{bot?.filename || "terminal"}</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
          {isLogsLoading && !logsData ? (
            <div className="space-y-2 opacity-50">
              <Skeleton className="h-4 w-1/3 bg-muted/50" />
              <Skeleton className="h-4 w-1/2 bg-muted/50" />
              <Skeleton className="h-4 w-1/4 bg-muted/50" />
            </div>
          ) : logsData?.logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <TerminalSquare className="w-10 h-10 mb-3 opacity-20" />
              <p>No logs available yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logsData?.logs.map((log, index) => (
                <div 
                  key={`${log.timestamp}-${index}`} 
                  className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-0.5 hover:bg-muted/10 rounded px-1 -mx-1 ${
                    log.level === 'error' ? 'text-red-400' : 'text-zinc-300'
                  }`}
                >
                  <span className="text-zinc-600 shrink-0 text-xs mt-0.5 whitespace-nowrap">
                    {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                  </span>
                  <span className="break-all whitespace-pre-wrap flex-1">
                    {log.level === 'error' && <AlertCircle className="w-3 h-3 inline-block mr-1.5 -mt-0.5 shrink-0" />}
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
