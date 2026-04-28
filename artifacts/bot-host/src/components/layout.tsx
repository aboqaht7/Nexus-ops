import { ReactNode } from "react";
import { Link } from "wouter";
import { Terminal, Activity, Server, Upload } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans selection:bg-primary/30 selection:text-primary-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="bg-primary/10 p-1.5 rounded-md border border-primary/20">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold tracking-tight text-lg">Nexus<span className="text-primary">Ops</span></span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Dashboard
            </Link>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              System Online
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
