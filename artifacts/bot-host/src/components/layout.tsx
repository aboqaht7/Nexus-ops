import { ReactNode } from "react";
import { Link } from "wouter";
import { Activity, Server, Sparkles, LogOut, User } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
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
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.imageUrl} alt={user.fullName ?? ""} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium text-sm truncate">{user.fullName ?? "User"}</span>
          <span className="text-xs text-muted-foreground font-normal truncate">
            {user.emailAddresses[0]?.emailAddress}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ redirectUrl: `${window.location.origin}${basePath}/` })}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans selection:bg-primary/30 selection:text-primary-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="bg-primary/10 p-1.5 rounded-md border border-primary/20">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold tracking-tight text-lg">Nexus<span className="text-primary">Ops</span></span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:block">Dashboard</span>
            </Link>
            <Link href="/agent" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:block">Agent-4</span>
            </Link>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="hidden sm:block">Online</span>
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
