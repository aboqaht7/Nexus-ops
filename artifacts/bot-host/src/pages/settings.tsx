import { UserProfile } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Layout } from "@/components/layout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>الإعدادات</h1>
          <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
            إدارة حسابك، ربط الحسابات الاجتماعية، والأمان.
          </p>
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
