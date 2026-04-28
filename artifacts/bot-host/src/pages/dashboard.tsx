import { useListBots, useGetBotsStats, getListBotsQueryKey, getGetBotsStatsQueryKey } from "@workspace/api-client-react";
import { UploadBotDialog } from "@/components/upload-bot-dialog";
import { BotCard } from "@/components/bot-card";
import { Layout } from "@/components/layout";
import { Activity, Server, XCircle, RefreshCw } from "lucide-react";
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
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>نظرة عامة على بوتاتك</h1>
          <p className="text-muted-foreground mt-1 text-sm">إدارة ومراقبة بوتات Discord الخاصة بك.</p>
        </div>
        <UploadBotDialog />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          title="إجمالي البوتات"
          value={stats?.total}
          icon={<Server className="w-4 h-4 text-primary" />}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="يعمل الآن"
          value={stats?.running}
          icon={<Activity className="w-4 h-4 text-emerald-500" />}
          isLoading={isLoadingStats}
          accent="emerald"
        />
        <StatCard
          title="تعطّل"
          value={stats?.crashed}
          icon={<XCircle className="w-4 h-4 text-red-500" />}
          isLoading={isLoadingStats}
          accent="red"
        />
        <StatCard
          title="إعادات التشغيل"
          value={stats?.totalRestarts}
          icon={<RefreshCw className="w-4 h-4 text-amber-500" />}
          isLoading={isLoadingStats}
          accent="amber"
        />
      </div>

      {/* Bots list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">البوتات النشطة</h2>
        <div className="h-px flex-1 bg-border mx-4" />
      </div>

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
        <div className="text-center py-20 px-4 border border-dashed border-border rounded-2xl bg-muted/30">
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#F26207", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="26" height="26" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
              <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
              <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد بوتات مُنشرة</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            لم تقم بنشر أي بوتات بعد. قم بتحميل ملف JavaScript أو Python للبدء.
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

function StatCard({
  title, value, icon, isLoading, accent
}: {
  title: string;
  value?: number;
  icon: React.ReactNode;
  isLoading: boolean;
  accent?: "emerald" | "red" | "amber";
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {icon}
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <span className="text-2xl font-bold text-foreground">{value ?? 0}</span>
      )}
    </div>
  );
}
