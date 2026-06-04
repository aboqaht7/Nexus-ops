import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Bot as BotIcon, Globe, Gamepad2, LayoutDashboard,
  ServerCog, FileCode2, RefreshCw,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

/* ── Brand palette ───────────────────────────────────────────────── */
const R = {
  bg: "#FAF7F2",
  bgCard: "#FFFFFF",
  bgChip: "#F0EAE3",
  text: "#0D0D0D",
  muted: "#6B6B6B",
  border: "#E8DDD5",
  orange: "#F26207",
  orangeHover: "#D95600",
  orangeLight: "#FEF3EC",
};

const PROJECT_TYPES = [
  { id: "discord-bot", Icon: BotIcon,        color: "#5865F2" },
  { id: "website",     Icon: Globe,          color: "#0EA5E9" },
  { id: "game",        Icon: Gamepad2,       color: "#EC4899" },
  { id: "web-app",     Icon: LayoutDashboard,color: "#10B981" },
  { id: "api-server",  Icon: ServerCog,      color: "#F59E0B" },
  { id: "python-script", Icon: FileCode2,    color: "#6366F1" },
];

export default function Home() {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const isRtl = i18n.dir() === "rtl";

  // Localized example prompts
  const examplePrompts = i18n.language === "ar"
    ? ["بوت Discord يحظر المزعجين", "موقع portfolio احترافي", "لعبة Snake بـ HTML5"]
    : i18n.language === "es"
      ? ["Un bot de Discord que banea spammers", "Un portfolio profesional", "Un juego Snake en HTML5"]
      : i18n.language === "fr"
        ? ["Un bot Discord qui bannit les spammeurs", "Un portfolio professionnel", "Un jeu Snake en HTML5"]
        : i18n.language === "de"
          ? ["Discord-Bot der Spammer bannt", "Professionelles Portfolio", "Snake-Spiel mit HTML5"]
          : i18n.language === "zh"
            ? ["封禁垃圾消息的 Discord 机器人", "专业作品集网站", "HTML5 贪吃蛇游戏"]
            : i18n.language === "ja"
              ? ["スパマーを禁止する Discord ボット", "プロのポートフォリオサイト", "HTML5 スネークゲーム"]
              : i18n.language === "ru"
                ? ["Discord-бот для бана спамеров", "Профессиональное портфолио", "Игра Snake на HTML5"]
                : ["A Discord bot that bans spammers", "A professional portfolio website", "A Snake game in HTML5"];

  const handlePromptSubmit = () => navigate(`${base}/sign-up`);

  return (
    <div style={{ background: R.bg, color: R.text, fontFamily: "'Inter', sans-serif", minHeight: "100dvh" }}>

      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: `${R.bg}E6`,
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${R.border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
                <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
                <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 17, color: R.text }}>
              Nexus<span style={{ color: R.orange }}>Ops</span>
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href={`${base}/pricing`} className="hidden sm:block" style={{ padding: "7px 14px", fontSize: 14, fontWeight: 500, color: R.muted, textDecoration: "none", borderRadius: 8 }}>
              {t("nav.pricing")}
            </Link>
            <Link href={`${base}/sign-in`} className="hidden sm:block" style={{ padding: "7px 14px", fontSize: 14, fontWeight: 500, color: R.text, textDecoration: "none", borderRadius: 8 }}>
              {t("nav.signIn")}
            </Link>
            <Link href={`${base}/sign-up`} style={{
              padding: "7px 14px", fontSize: 14, fontWeight: 600,
              color: R.orange, textDecoration: "none",
              border: `1.5px solid ${R.orange}`, borderRadius: 99,
              whiteSpace: "nowrap",
            }}>
              {t("nav.signUp")}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "80px 24px 40px", maxWidth: 880, margin: "0 auto" }}>
        <div style={{
          display: "inline-block",
          fontSize: 12, fontWeight: 600,
          color: R.orange, background: R.orangeLight,
          padding: "5px 14px", borderRadius: 99, marginBottom: 20,
          letterSpacing: "0.02em",
        }}>
          ✨ {t("home.heroTag")}
        </div>
        <h1 style={{
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(40px, 6.5vw, 72px)",
          fontWeight: 600, lineHeight: 1.08,
          letterSpacing: "-0.02em",
          color: R.text, marginBottom: 20,
        }}>
          {t("home.heroTitle")}{" "}
          <span style={{ color: R.orange }}>{t("home.heroTitleAccent")}</span>
        </h1>
        <p style={{ fontSize: 17, color: R.muted, marginBottom: 36, lineHeight: 1.7, maxWidth: 600, margin: "0 auto 36px" }}>
          {t("home.heroSubtitle")}
        </p>

        {/* Prompt input */}
        <div style={{
          background: R.bgCard, border: `1.5px solid ${R.border}`,
          borderRadius: 16, padding: "12px 12px 12px 16px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          maxWidth: 680, margin: "0 auto",
          flexDirection: isRtl ? "row-reverse" : "row",
        }}>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePromptSubmit()}
            placeholder={t("home.promptPlaceholder")}
            dir={isRtl ? "rtl" : "ltr"}
            style={{
              flex: 1, border: "none", outline: "none",
              fontSize: 15, color: R.text, background: "transparent",
              fontFamily: "inherit",
              textAlign: isRtl ? "right" : "left",
            }}
          />
          <button
            onClick={handlePromptSubmit}
            style={{
              width: 36, height: 36, borderRadius: 99,
              background: R.orange, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ArrowRight size={17} color="white" style={{ transform: isRtl ? "scaleX(-1)" : "none" }} />
          </button>
        </div>

        {/* Example prompts */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: R.muted }}>
            <RefreshCw size={12} /> {t("home.examplesTitle")}
          </span>
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              style={{
                padding: "5px 14px", fontSize: 13, borderRadius: 99,
                border: `1px solid ${R.border}`, background: R.bgChip,
                color: R.text, cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      {/* ── Project types grid ─────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px" }}>
        <h2 style={{
          textAlign: "center",
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(28px, 3.5vw, 40px)",
          fontWeight: 600, color: R.text, marginBottom: 8,
        }}>
          {t("home.projectTypesTitle")}
        </h2>
        <p style={{ textAlign: "center", fontSize: 15, color: R.muted, marginBottom: 44 }}>
          {t("home.projectTypesSubtitle")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {PROJECT_TYPES.map(({ id, Icon, color }) => (
            <div
              key={id}
              style={{
                background: R.bgCard, border: `1px solid ${R.border}`,
                borderRadius: 16, padding: 24,
                transition: "transform 0.15s, box-shadow 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              onClick={() => navigate(`${base}/sign-up`)}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: `${color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 14,
              }}>
                <Icon size={22} color={color} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: R.text, marginBottom: 6 }}>
                {t(`projectTypes.${id}`)}
              </h3>
              <p style={{ fontSize: 13.5, color: R.muted, lineHeight: 1.55 }}>
                {t(`projectTypes.${id}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section style={{ padding: "60px 24px 80px", borderTop: `1px solid ${R.border}` }}>
        <div style={{
          maxWidth: 720, margin: "0 auto",
          background: R.bgCard, border: `1.5px solid ${R.border}`,
          borderRadius: 20, padding: 44, textAlign: "center",
        }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "clamp(28px, 3.5vw, 40px)",
            fontWeight: 600, color: R.text, marginBottom: 14,
          }}>
            {t("home.heroTitle")}
          </h2>
          <p style={{ fontSize: 15, color: R.muted, marginBottom: 24 }}>
            {t("home.heroSubtitle")}
          </p>
          <Link
            href={`${base}/sign-up`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", fontSize: 15, fontWeight: 600,
              background: R.orange, color: "#fff",
              borderRadius: 99, textDecoration: "none",
            }}
          >
            {t("home.ctaStart")} <ArrowRight size={16} style={{ transform: isRtl ? "scaleX(-1)" : "none" }} />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${R.border}`, padding: "28px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: R.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
                <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
                <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
              </svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, color: R.text }}>NexusOps</span>
          </div>
          <p style={{ fontSize: 13, color: R.muted }}>{t("home.footerRights")}</p>
        </div>
      </footer>
    </div>
  );
}
