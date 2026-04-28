import { useState, useEffect } from "react";
import { useListBots, useGetBotsStats, getListBotsQueryKey, getGetBotsStatsQueryKey } from "@workspace/api-client-react";
import { UploadBotDialog } from "@/components/upload-bot-dialog";
import { BotCard } from "@/components/bot-card";
import { Layout } from "@/components/layout";
import { Activity, Server, XCircle, RefreshCw, Coins, Crown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = `${base}/api`;

interface SubscriptionInfo {
  plan: "free" | "pro" | "unlimited";
  billing: "monthly" | "yearly" | null;
  expiresAt: string | null;
  limits: { maxBots: number; tokensPerMonth: number };
  usage: { bots: number };
}

const PLAN_LABEL: Record<string, string> = {
  free: "مجاني",
  pro: "Pro",
  unlimited: "Unlimited",
};

const PLAN_COLOR: Record<string, string> = {
  free: "#6B6B6B",
  pro: "#F26207",
  unlimited: "#7C3AED",
};

export default function Dashboard() {
  const { data: bots, isLoading: isLoadingBots } = useListBots({
    query: { refetchInterval: 3000, queryKey: getListBotsQueryKey() }
  });

  const { data: stats, isLoading: isLoadingStats } = useGetBotsStats({
    query: { refetchInterval: 3000, queryKey: getGetBotsStatsQueryKey() }
  });

  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const { getToken } = useAuth();

  useEffect(() => {
    getToken().then(async (token) => {
      try {
        const resp = await fetch(`${apiBase}/subscriptions/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (resp.ok) setSub(await resp.json() as SubscriptionInfo);
      } catch {}
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planColor = sub ? PLAN_COLOR[sub.plan] : "#6B6B6B";
  const botUsage = sub ? sub.usage.bots : (bots?.length ?? 0);
  const maxBots = sub?.limits.maxBots ?? 1;
  const botsPercent = maxBots === -1 ? 0 : Math.min((botUsage / maxBots) * 100, 100);
  const isAtLimit = maxBots !== -1 && botUsage >= maxBots;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>نظرة عامة على بوتاتك</h1>
          <p className="text-muted-foreground mt-1 text-sm">إدارة ومراقبة بوتات Discord الخاصة بك.</p>
        </div>
        <UploadBotDialog />
      </div>

      {/* Plan banner */}
      {sub && (
        <div style={{
          background: sub.plan === "free" ? "#FAF7F2" : sub.plan === "unlimited" ? "#F5F3FF" : "#FEF3EC",
          border: `1.5px solid ${planColor}22`,
          borderRadius: 14,
          padding: "14px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Crown size={18} color={planColor} />
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: planColor }}>
                خطة {PLAN_LABEL[sub.plan]}
              </span>
              {sub.expiresAt && (
                <span style={{ fontSize: 12, color: "#6B6B6B", marginRight: 8 }}>
                  · تنتهي {new Date(sub.expiresAt).toLocaleDateString("ar-SA")}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            {/* Bots usage bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B6B6B", fontWeight: 600 }}>
                <span>البوتات</span>
                <span style={{ color: isAtLimit ? "#EF4444" : "#0D0D0D" }}>
                  {botUsage} / {maxBots === -1 ? "∞" : maxBots}
                </span>
              </div>
              <div style={{ height: 5, background: "#E8DDD5", borderRadius: 99, overflow: "hidden", width: "100%" }}>
                <div style={{
                  height: "100%",
                  width: maxBots === -1 ? "20%" : `${botsPercent}%`,
                  background: isAtLimit ? "#EF4444" : planColor,
                  borderRadius: 99,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>

            {/* Tokens */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B6B6B" }}>
              <Coins size={13} color={planColor} />
              <span style={{ fontWeight: 600 }}>
                {sub.limits.tokensPerMonth === -1 ? "توكنات غير محدودة" : `${sub.limits.tokensPerMonth} توكن/شهر`}
              </span>
            </div>

            {sub.plan === "free" && (
              <Link href={`${base}/pricing`} style={{
                fontSize: 12, fontWeight: 700, color: "#fff",
                background: "#F26207", borderRadius: 8, padding: "5px 14px",
                textDecoration: "none",
              }}>
                ترقية الخطة ↑
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Limit warning */}
      {isAtLimit && (
        <div style={{
          background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12,
          padding: "12px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <p style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
            ⚠️ وصلت للحد الأقصى من البوتات في خطتك. رقّ خطتك لإضافة المزيد.
          </p>
          <Link href={`${base}/pricing`} style={{
            fontSize: 12, fontWeight: 700, color: "#fff",
            background: "#EF4444", borderRadius: 8, padding: "5px 14px",
            textDecoration: "none", whiteSpace: "nowrap",
          }}>
            ترقية الآن
          </Link>
        </div>
      )}

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
