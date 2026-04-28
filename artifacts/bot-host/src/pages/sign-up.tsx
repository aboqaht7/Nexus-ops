import { SignUp } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Server } from "lucide-react";
import { Link } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="px-6 h-14 flex items-center border-b border-border/50">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="bg-primary/10 p-1 rounded-md border border-primary/20">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-sm">Nexus<span className="text-primary">Ops</span></span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          fallbackRedirectUrl={`${basePath}/dashboard`}
          appearance={{
            theme: dark,
            cssLayerName: "clerk",
            variables: {
              colorPrimary: "#3b82f6",
              colorBackground: "#09090b",
              colorForeground: "#fafafa",
              colorMutedForeground: "#71717a",
              colorDanger: "#ef4444",
              colorInput: "#18181b",
              colorInputForeground: "#fafafa",
              colorNeutral: "#27272a",
              fontFamily: "inherit",
              borderRadius: "0.5rem",
            },
            elements: {
              rootBox: "w-full flex justify-center",
              cardBox: "bg-card border border-border rounded-xl w-[440px] max-w-full overflow-hidden shadow-2xl",
              card: "!shadow-none !border-0 !bg-transparent !rounded-none",
              footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
              headerTitle: "text-foreground",
              headerSubtitle: "text-muted-foreground",
              socialButtonsBlockButtonText: "text-foreground",
              formFieldLabel: "text-foreground",
              footerActionLink: "text-primary hover:text-primary/80",
              footerActionText: "text-muted-foreground",
              dividerText: "text-muted-foreground",
              formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
              formFieldInput: "bg-input text-foreground border-border",
              socialButtonsBlockButton: "border-border bg-card hover:bg-muted",
              identityPreviewEditButton: "text-primary",
              logoBox: "justify-center",
              logoImage: "h-8 w-8",
              main: "gap-4",
              alert: "bg-destructive/10 border-destructive/20",
              alertText: "text-destructive",
              formFieldSuccessText: "text-emerald-400",
              dividerLine: "bg-border",
            },
            options: {
              logoPlacement: "inside",
              logoLinkUrl: `${window.location.origin}${basePath}/`,
              logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
            },
          }}
        />
      </div>
    </div>
  );
}
