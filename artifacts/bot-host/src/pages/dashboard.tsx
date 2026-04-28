import { useListBots, useGetBotsStats, getListBotsQueryKey, getGetBotsStatsQueryKey } from "@workspace/api-client-react";
import { UploadBotDialog } from "@/components/upload-bot-dialog";
import { BotCard } from "@/components/bot-card";
import { Layout } from "@/components/layout";
import { Activity, Server, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: bots, isLoading: isLoadingBots } = useListBots({ 
    query: { refetchInterval: 3000, queryKey: getListBotsQueryKey() } 
  });
  
  const { data: stats, isLoading: isLoadingStats } = useGetBotsStats({ 
    query: { refetchInterval: 3000, queryKey: getGetBotsStatsQueryKey() } 
  });

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleet Overview</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor your deployed Discord bots.</p>
        </div>
        <UploadBotDialog />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard 
          title="Total Bots" 
          value={stats?.total} 
          icon={<Server className="w-5 h-5 text-primary" />} 
          isLoading={isLoadingStats} 
        />
        <StatCard 
          title="Running" 
          value={stats?.running} 
          icon={<Activity className="w-5 h-5 text-emerald-500" />} 
          isLoading={isLoadingStats} 
        />
        <StatCard 
          title="Crashed" 
          value={stats?.crashed} 
          icon={<XCircle className="w-5 h-5 text-red-500" />} 
          isLoading={isLoadingStats} 
        />
        <StatCard 
          title="Total Restarts" 
          value={stats?.totalRestarts} 
          icon={<Clock className="w-5 h-5 text-amber-500" />} 
          isLoading={isLoadingStats} 
        />
      </div>

      <h2 className="text-xl font-semibold tracking-tight mb-4 border-b border-border/50 pb-2">Active Deployments</h2>
      
      {isLoadingBots ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-[220px] bg-card rounded-xl border border-border p-5">
              <Skeleton className="h-6 w-3/4 mb-4" />
              <Skeleton className="h-4 w-1/2 mb-8" />
              <div className="grid grid-cols-2 gap-4 mb-8">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-8 w-full mt-auto" />
            </div>
          ))}
        </div>
      ) : bots?.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-border rounded-xl bg-muted/10">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-1">No bots deployed</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            You don't have any bots running yet. Upload a JavaScript or Python file to get started.
          </p>
          <UploadBotDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots?.map(bot => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function StatCard({ title, value, icon, isLoading }: { title: string, value?: number, icon: React.ReactNode, isLoading: boolean }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground tracking-wide">{title}</span>
        {icon}
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <span className="text-2xl font-bold text-foreground">{value ?? 0}</span>
      )}
    </div>
  );
}
