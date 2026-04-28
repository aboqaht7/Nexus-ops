import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Terminal,
  KeyRound,
  Zap,
  GitBranch,
  Sparkles,
  Code2,
  RotateCw,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: <RotateCw className="w-5 h-5 text-emerald-400" />,
    title: "24/7 Auto-restart",
    desc: "Your bots stay online around the clock. Automatic crash recovery with exponential backoff.",
    color: "emerald",
  },
  {
    icon: <Code2 className="w-5 h-5 text-blue-400" />,
    title: "Monaco Editor",
    desc: "Edit your bot code directly in the browser with VS Code's powerful editor engine.",
    color: "blue",
  },
  {
    icon: <Terminal className="w-5 h-5 text-violet-400" />,
    title: "Live Terminal",
    desc: "Full bash terminal in the browser. Run commands, install packages, debug live.",
    color: "violet",
  },
  {
    icon: <KeyRound className="w-5 h-5 text-amber-400" />,
    title: "Secrets Manager",
    desc: "Per-bot environment variables. Store BOT_TOKEN and other secrets securely.",
    color: "amber",
  },
  {
    icon: <Sparkles className="w-5 h-5 text-pink-400" />,
    title: "AI Assistant",
    desc: "Agent-4 writes full Discord bots for you. Just describe what you need.",
    color: "pink",
  },
  {
    icon: <GitBranch className="w-5 h-5 text-cyan-400" />,
    title: "GitHub Sync",
    desc: "Import from GitHub, export back with one click. Keep your code versioned.",
    color: "cyan",
  },
];

const steps = [
  { n: "01", title: "Create an account", desc: "Sign up free. No credit card required." },
  { n: "02", title: "Deploy your bot", desc: "Upload a .js or .py file, import from GitHub, or start from a template." },
  { n: "03", title: "Go live 24/7", desc: "Your bot runs forever. Edit code, manage secrets, watch logs in real time." },
];

export default function Home() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 p-1.5 rounded-md border border-primary/20">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              Nexus<span className="text-primary">Ops</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/sign-in`}>Sign In</Link>
            </Button>
            <Button size="sm" className="gap-1.5" asChild>
              <Link href={`${base}/sign-up`}>
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-24 pb-20 text-center">
        <Badge variant="outline" className="mb-6 text-xs text-primary border-primary/30 bg-primary/5 px-3 py-1">
          <Zap className="w-3 h-3 mr-1.5" />
          Discord Bot Hosting Platform
        </Badge>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-none">
          Host your bots{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-500">
            24/7 for free
          </span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          NexusOps is the easiest way to deploy and manage Discord bots. Edit code in the browser,
          view real-time logs, manage secrets — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" className="gap-2 shadow-lg shadow-primary/20 text-base px-8" asChild>
            <Link href={`${base}/sign-up`}>
              Start for free <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="gap-2 text-base px-8" asChild>
            <Link href={`${base}/sign-in`}>Sign In</Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="flex flex-col sm:flex-row gap-8 justify-center mt-16 text-center">
          {[
            { value: "24/7", label: "Uptime guarantee" },
            { value: "JS & Python", label: "Languages supported" },
            { value: "Free", label: "Forever plan" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-foreground">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Everything you need to run bots
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            A complete developer environment in the browser — no server needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-card border border-border rounded-xl p-6 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mb-4 border border-border">
                {f.icon}
              </div>
              <h3 className="font-semibold text-base mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 bg-muted/20">
        <div className="container mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Up and running in minutes
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="text-5xl font-black text-primary/20 mb-4">{s.n}</div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Included */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl p-8 shadow-xl shadow-black/20">
          <h2 className="text-2xl font-bold mb-6 text-center">What's included — free</h2>
          <ul className="space-y-3">
            {[
              "Unlimited bots",
              "Monaco code editor (VS Code in browser)",
              "Real-time terminal access",
              "Secrets & environment variables",
              "Auto-restart on crash",
              "GitHub import & export",
              "Agent-4 AI coding assistant",
              "Real-time log streaming",
              "Package manager (npm / pip)",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full mt-8 gap-2" asChild>
            <Link href={`${base}/sign-up`}>
              Create free account <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground/80">NexusOps</span>
          </div>
          <span>© 2026 NexusOps — Discord Bot Hosting Platform</span>
        </div>
      </footer>
    </div>
  );
}
