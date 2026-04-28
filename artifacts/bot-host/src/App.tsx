import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, RedirectToSignIn, useAuth } from "@clerk/react";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import BotLogs from "@/pages/bot-logs";
import AgentPage from "@/pages/agent";
import BotEditor from "@/pages/bot-editor";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Pricing from "@/pages/pricing";
import Checkout from "@/pages/checkout";
import PaymentSuccess from "@/pages/payment-success";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

// Passes Clerk session token to every API call via Bearer header
function ClerkTokenSetter() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

// Home page: signed-in → dashboard, signed-out → landing
function HomeRoute() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <Home />;
}

// Wraps a component so it requires authentication
function Protected({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <RedirectToSignIn />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/dashboard" component={() => <Protected component={Dashboard} />} />
      <Route path="/agent" component={() => <Protected component={AgentPage} />} />
      <Route path="/bots/:id/logs" component={() => <Protected component={BotLogs} />} />
      <Route path="/bots/:id/editor" component={() => <Protected component={BotEditor} />} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function InnerApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkTokenSetter />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  if (!clerkPubKey) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Missing VITE_CLERK_PUBLISHABLE_KEY</p>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      {...(clerkProxyUrl ? { proxyUrl: clerkProxyUrl } : {})}
      appearance={{}}
      routerPush={(to) => window.history.pushState(null, "", stripBase(to))}
      routerReplace={(to) => window.history.replaceState(null, "", stripBase(to))}
    >
      <InnerApp />
    </ClerkProvider>
  );
}

export default App;
