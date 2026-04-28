import { ReactNode } from "react";
import { Link } from "wouter";
import { Activity, Sparkles, LogOut, Crown } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function UserMenu() {
  const { signOut } = useClerk();
  const { user } = useUser();

  if (!user) return null;

  const initials = (user.fullName ?? user.emailAddresses[0]?.emailAddress ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity focus:outline-none">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarImage src={user.imageUrl} alt={user.fullName ?? ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm truncate">{user.fullName ?? "المستخدم"}</span>
          <span className="text-xs text-muted-foreground font-normal truncate">
            {user.emailAddresses[0]?.emailAddress}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`${basePath}/pricing`} className="flex items-center gap-2 cursor-pointer text-primary font-medium">
            <Crown className="w-4 h-4" />
            ترقية الخطة
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ redirectUrl: `${window.location.origin}${basePath}/` })}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="w-4 h-4 ml-2" />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href={`${basePath}/dashboard`} className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#F26207", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="4" width="14" height="3.5" rx="1" fill="white" />
                <rect x="2" y="9.5" width="14" height="3.5" rx="1" fill="white" opacity="0.7" />
                <circle cx="13.5" cy="5.75" r="1.25" fill="#FFD580" />
              </svg>
            </div>
            <span className="font-bold text-base text-foreground">
              Nexus<span className="text-primary">Ops</span>
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <Link
              href={`${basePath}/dashboard`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span className="hidden sm:block">لوحة التحكم</span>
            </Link>
            <Link
              href={`${basePath}/agent`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:block">Agent-4</span>
            </Link>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mx-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:block">متصل</span>
            </div>
            <UserMenu />
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
