import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Bot, Music, Shield, Star, Gift, Ticket, Hash, RefreshCw } from "lucide-react";

/* ── Replit brand tokens ─────────────────────────────────────────── */
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

const botTypes = [
  { icon: <Bot className="w-4 h-4" />, label: "Moderation" },
  { icon: <Music className="w-4 h-4" />, label: "Music" },
  { icon: <Star className="w-4 h-4" />, label: "Leveling" },
  { icon: <Gift className="w-4 h-4" />, label: "Giveaway" },
  { icon: <Ticket className="w-4 h-4" />, label: "Tickets" },
  { icon: <Hash className="w-4 h-4" />, label: "Logging" },
];

const examplePrompts = [
  "A bot that auto-bans spammers",
  "A music bot with playlist support",
  "A leveling system with XP roles",
];

const features = [
  {
    tag: "Always On",
    title: "Your bots run\n24/7 without interruption",
    desc: "Auto-restart on crash, exponential backoff recovery, and real-time uptime monitoring — your bots stay alive around the clock.",
    bg: "#1A1A2E",
    textColor: "#FFFFFF",
    accent: R.orange,
    big: true,
  },
  {
    tag: "Code Editor",
    title: "VS Code in your browser",
    desc: "Monaco editor with full syntax highlighting, IntelliSense, and multi-language support for JS and Python.",
    bg: "#F0EAE3",
    textColor: R.text,
    accent: R.orange,
    big: false,
  },
  {
    tag: "Terminal",
    title: "Full bash terminal",
    desc: "Real xterm.js terminal connected to a live shell. Run npm install, debug live, execute any command.",
    bg: "#0D1117",
    textColor: "#4ADE80",
    accent: "#4ADE80",
    big: false,
  },
  {
    tag: "Secrets",
    title: "Secure environment\nvariables",
    desc: "Per-bot secrets management. Store your BOT_TOKEN and other sensitive keys safely — never exposed in code.",
    bg: R.orangeLight,
    textColor: R.text,
    accent: R.orange,
    big: false,
  },
  {
    tag: "AI Agent",
    title: "Agent-4 writes bots for you",
    desc: "Describe what you need in plain English. Agent-4 generates complete, production-ready Discord bots with a single prompt.",
    bg: "#EEF2FF",
    textColor: "#1E1B4B",
    accent: "#6366F1",
    big: false,
  },
  {
    tag: "Packages",
    title: "npm & pip package manager",
    desc: "Install any package directly from the browser. Real-time installation output, zero configuration required.",
    bg: "#F0FDF4",
    textColor: "#14532D",
    accent: "#16A34A",
    big: false,
  },
];

const plans = [
  {
    name: "Starter",
    price: "Free",
    sub: "For getting started",
    items: ["Unlimited bots", "Monaco code editor", "Real-time logs", "Community support"],
    cta: "Sign up",
    highlight: false,
  },
  {
    name: "NexusOps Core",
    price: "$0",
    sub: "Everything free, forever",
    items: ["Everything in Starter", "Live terminal access", "npm / pip packages", "Secrets manager", "GitHub sync", "Agent-4 AI assistant"],
    cta: "Get started",
    highlight: true,
  },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [promptExample, setPromptExample] = useState(0);
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handlePromptSubmit = () => {
    navigate(`${base}/sign-up`);
  };

  const cyclePrompt = () => {
    const next = (promptExample + 1) % examplePrompts.length;
    setPromptExample(next);
    setPrompt(examplePrompts[next]);
  };

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
          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: R.orange, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
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

          {/* Nav right */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
              href={`${base}/sign-in`}
              style={{ padding: "7px 16px", fontSize: 14, fontWeight: 500, color: R.text, textDecoration: "none", borderRadius: 8 }}
              onMouseEnter={e => (e.currentTarget.style.background = R.bgChip)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Log in
            </Link>
            <Link
              href={`${base}/sign-up`}
              style={{
                padding: "7px 18px", fontSize: 14, fontWeight: 600,
                color: R.orange, textDecoration: "none",
                border: `1.5px solid ${R.orange}`, borderRadius: 99,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = R.orange; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = R.orange; }}
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "90px 24px 60px", maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(48px, 7vw, 80px)",
          fontWeight: 600, lineHeight: 1.08,
          letterSpacing: "-0.02em",
          color: R.text, marginBottom: 20,
        }}>
          What bot will you build?
        </h1>
        <p style={{ fontSize: 18, color: R.muted, marginBottom: 36, lineHeight: 1.6, maxWidth: 520, margin: "0 auto 36px" }}>
          Deploy Discord bots in seconds — no server needed. Edit code, manage secrets, and go live 24/7 from your browser.
        </p>

        {/* Prompt input */}
        <div style={{
          background: R.bgCard, border: `1.5px solid ${R.border}`,
          borderRadius: 16, padding: "12px 12px 12px 16px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          maxWidth: 680, margin: "0 auto",
          transition: "border-color 0.15s",
        }}
          onFocus={e => (e.currentTarget.style.borderColor = R.orange)}
          onBlur={e => (e.currentTarget.style.borderColor = R.border)}
        >
          <button
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${R.border}`,
              background: R.bg, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, color: R.muted, flexShrink: 0,
            }}
          >+</button>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePromptSubmit()}
            placeholder="Describe your bot idea, or start from a template..."
            style={{
              flex: 1, border: "none", outline: "none",
              fontSize: 15, color: R.text, background: "transparent",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={handlePromptSubmit}
            style={{
              width: 36, height: 36, borderRadius: 99,
              background: R.orange, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = R.orangeHover)}
            onMouseLeave={e => (e.currentTarget.style.background = R.orange)}
          >
            <ArrowRight size={17} color="white" />
          </button>
        </div>

        {/* Bot type chips */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          <button
            style={{ width: 28, height: 28, borderRadius: 99, border: `1px solid ${R.border}`, background: R.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: R.muted }}
            onClick={() => {}}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M7.5 6L1.5 1.5v9L7.5 6z"/></svg>
          </button>
          {botTypes.map((t) => (
            <button
              key={t.label}
              onClick={handlePromptSubmit}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 99,
                border: `1px solid ${R.border}`, background: R.bg,
                fontSize: 13, fontWeight: 500, color: R.text,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = R.orange; e.currentTarget.style.color = R.orange; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = R.border; e.currentTarget.style.color = R.text; }}
            >
              {t.icon} {t.label}
            </button>
          ))}
          <button
            style={{ width: 28, height: 28, borderRadius: 99, border: `1px solid ${R.border}`, background: R.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: R.muted }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4.5 6L10.5 1.5v9L4.5 6z"/></svg>
          </button>
        </div>

        {/* Example prompts */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            onClick={cyclePrompt}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: R.muted, background: "none", border: "none", cursor: "pointer" }}
          >
            <RefreshCw size={12} /> Try an example prompt
          </button>
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => { setPrompt(p); }}
              style={{
                padding: "4px 12px", fontSize: 13, borderRadius: 99,
                border: `1px solid ${R.border}`, background: R.bgChip,
                color: R.text, cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      {/* ── Social proof ───────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "20px 24px 60px", borderTop: `1px solid ${R.border}` }}>
        <p style={{ fontSize: 13, color: R.muted, marginBottom: 28, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>
          Works with your favorite tools
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 48, flexWrap: "wrap", opacity: 0.5 }}>
          {["discord.js", "discord.py", "Node.js", "Python 3", "npm", "pip"].map(l => (
            <span key={l} style={{ fontSize: 15, fontWeight: 600, color: R.text, letterSpacing: "-0.01em" }}>{l}</span>
          ))}
        </div>
      </section>

      {/* ── Features bento grid ────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px" }}>
        <p style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: R.orange, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
          PLATFORM FEATURES
        </p>
        <h2 style={{
          textAlign: "center",
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(32px, 4vw, 48px)",
          fontWeight: 600, color: R.text,
          marginBottom: 48, lineHeight: 1.15,
        }}>
          Everything you need to run bots
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                background: f.bg,
                borderRadius: 16,
                padding: 28,
                border: `1px solid ${f.bg === R.bgCard ? R.border : "transparent"}`,
                gridColumn: i === 0 ? "span 1" : undefined,
              }}
            >
              <span style={{
                display: "inline-block",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: f.accent,
                marginBottom: 12,
              }}>
                {f.tag}
              </span>
              <h3 style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 20, fontWeight: 600, lineHeight: 1.3,
                color: f.textColor, marginBottom: 10,
                whiteSpace: "pre-line",
              }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: f.bg === "#0D1117" || f.bg === "#1A1A2E" ? "rgba(255,255,255,0.55)" : R.muted }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────── */}
      <section style={{ padding: "60px 24px 80px", borderTop: `1px solid ${R.border}` }}>
        <h2 style={{
          textAlign: "center",
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(32px, 4vw, 48px)",
          fontWeight: 600, color: R.text, marginBottom: 12,
        }}>Pricing</h2>
        <p style={{ textAlign: "center", fontSize: 16, color: R.muted, marginBottom: 48 }}>
          Choose the best plan for you.
        </p>

        <div style={{ display: "flex", gap: 20, maxWidth: 780, margin: "0 auto", justifyContent: "center", flexWrap: "wrap" }}>
          {plans.map((p) => (
            <div
              key={p.name}
              style={{
                background: R.bgCard,
                border: p.highlight ? `2px solid ${R.orange}` : `1px solid ${R.border}`,
                borderRadius: 16, padding: 28, flex: "1 1 300px", maxWidth: 360,
                boxShadow: p.highlight ? `0 0 0 4px ${R.orangeLight}` : "none",
              }}
            >
              {p.highlight && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: R.orange, color: "#fff",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "3px 10px", borderRadius: 99, marginBottom: 14,
                }}>
                  MOST POPULAR
                </div>
              )}
              <p style={{ fontSize: 14, fontWeight: 600, color: R.muted, marginBottom: 6 }}>{p.name}</p>
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: 42, fontWeight: 600, color: R.text, marginBottom: 4 }}>
                {p.price}
              </p>
              <p style={{ fontSize: 13, color: R.muted, marginBottom: 24 }}>{p.sub}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: 28, display: "flex", flexDirection: "column", gap: 10 }}>
                {p.items.map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: R.text }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="8" fill={p.highlight ? R.orange : R.bgChip} />
                      <path d="M5 8l2 2 4-4" stroke={p.highlight ? "#fff" : R.orange} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`${base}/sign-up`}
                style={{
                  display: "block", textAlign: "center",
                  padding: "11px 0", borderRadius: 10,
                  fontSize: 14, fontWeight: 600, textDecoration: "none",
                  background: p.highlight ? R.orange : "transparent",
                  color: p.highlight ? "#fff" : R.text,
                  border: `1.5px solid ${p.highlight ? R.orange : R.border}`,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  if (!p.highlight) { e.currentTarget.style.borderColor = R.orange; e.currentTarget.style.color = R.orange; }
                  else e.currentTarget.style.background = R.orangeHover;
                }}
                onMouseLeave={e => {
                  if (!p.highlight) { e.currentTarget.style.borderColor = R.border; e.currentTarget.style.color = R.text; }
                  else e.currentTarget.style.background = R.orange;
                }}
              >
                {p.cta}
              </Link>
            </div>
          ))}
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
          <p style={{ fontSize: 13, color: R.muted }}>© 2026 NexusOps — Discord Bot Hosting Platform</p>
          <div style={{ display: "flex", gap: 20 }}>
            {["Docs", "GitHub", "Discord"].map(l => (
              <a key={l} href="#" style={{ fontSize: 13, color: R.muted, textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = R.text)}
                onMouseLeave={e => (e.currentTarget.style.color = R.muted)}
              >{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
