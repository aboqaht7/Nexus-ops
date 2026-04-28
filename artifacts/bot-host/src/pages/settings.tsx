import { UserProfile, useClerk } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Layout } from "@/components/layout";
import { LogOut } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const { signOut } = useClerk();

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>الإعدادات</h1>
            <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
              إدارة حسابك، ربط الحسابات الاجتماعية، والأمان.
            </p>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: `${window.location.origin}${basePath}/` })}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 18px", borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              background: "transparent",
              border: "1.5px solid #EF4444",
              color: "#EF4444",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <LogOut size={15} />
            تسجيل الخروج
          </button>
        </div>

        <UserProfile
          routing="path"
          path={`${basePath}/settings`}
          appearance={{
            baseTheme: dark,
            elements: {
              rootBox: {
                width: "100%",
                boxShadow: "none",
              },
              card: {
                width: "100%",
                boxShadow: "none",
                border: "1px solid var(--border)",
                borderRadius: "16px",
                background: "var(--card)",
              },
              navbar: {
                borderRight: "1px solid var(--border)",
              },
              navbarButton: {
                fontSize: "13px",
              },
              headerTitle: {
                fontSize: "18px",
                fontWeight: "700",
              },
              headerSubtitle: {
                fontSize: "13px",
              },
            },
          }}
        />
      </div>
    </Layout>
  );
}
