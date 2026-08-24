import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { useSetMyRole } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/logo';
import { brand } from '@workspace/brand';
import { Briefcase, Search, Building2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import LandingPage from '@/pages/landing';
import { AppLayout } from '@/components/layout';
import Dashboard from '@/pages/dashboard';
import DealsList from '@/pages/deals/index';
import DealDetail from '@/pages/deals/detail';
import DealCreate from '@/pages/deals/new';
// We will create these shortly
import AccessRequests from '@/pages/access-requests';
import Mandates from '@/pages/mandates';
import MandateMatches from '@/pages/mandates/matches';
import Brokers from '@/pages/brokers';
import Professionals from '@/pages/professionals';
import Engagements from '@/pages/engagements';
import ChecklistTemplates from '@/pages/checklist-templates';
import BrokerDetail from '@/pages/brokers/detail';
import Messages from '@/pages/messages';
import Transactions from '@/pages/transactions';
import NotFound from '@/pages/not-found';
import BrokerProfile from '@/pages/broker-profile';
import Assignments from '@/pages/assignments';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background dark text-foreground flex flex-col items-center justify-center gap-6 p-8">
      <BrandMark className="h-12 w-12" />
      {children}
    </div>
  );
}

function RolePicker() {
  const setRole = useSetMyRole();

  const choose = (role: 'broker' | 'investor' | 'owner') => {
    setRole.mutate(
      { data: { role } },
      { onSuccess: () => window.location.reload() },
    );
  };

  return (
    <AuthScreen>
      <h1 className="text-2xl font-heading font-bold">How will you use {brand.name}?</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Choose your role to continue. Brokers list deals and manage data room access; investors request access to confidential opportunities; property owners find brokers for their assets.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button size="lg" disabled={setRole.isPending} onClick={() => choose('broker')} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8" data-testid="button-role-broker">
          <Briefcase className="w-5 h-5 mr-2" /> I'm a Broker
        </Button>
        <Button size="lg" variant="outline" disabled={setRole.isPending} onClick={() => choose('investor')} className="border-primary/30 px-8" data-testid="button-role-investor">
          <Search className="w-5 h-5 mr-2" /> I'm an Investor
        </Button>
        <Button size="lg" variant="outline" disabled={setRole.isPending} onClick={() => choose('owner')} className="border-primary/30 px-8" data-testid="button-role-owner">
          <Building2 className="w-5 h-5 mr-2" /> I'm a Property Owner
        </Button>
      </div>
      {setRole.isError && (
        <p className="text-sm text-destructive">Could not save your role. Please try again.</p>
      )}
    </AuthScreen>
  );
}

function SignInPrompt() {
  const { login } = useAuth();
  // Demo entry works without any external account: the API signs the visitor
  // in as a fixed, fictional demo persona and returns them to this page.
  const demoLoginUrl = (persona: 'investor' | 'broker') => {
    const base = import.meta.env.BASE_URL;
    const returnTo = window.location.pathname + window.location.search;
    return `${base}api/demo-login?as=${persona}&returnTo=${encodeURIComponent(returnTo)}`;
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background p-8 text-center">
      <BrandMark className="h-12 w-12" />
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Explore {brand.name}</h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Browse the platform instantly with a demo account — no sign-up needed — or sign in with your own account.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8" data-testid="button-demo-investor">
          <a href={demoLoginUrl('investor')}><Search className="w-5 h-5 mr-2" /> Explore as Investor</a>
        </Button>
        <Button asChild size="lg" variant="outline" className="border-primary/30 px-8" data-testid="button-demo-broker">
          <a href={demoLoginUrl('broker')}><Briefcase className="w-5 h-5 mr-2" /> Explore as Broker</a>
        </Button>
      </div>
      <Button onClick={login} variant="ghost" className="text-muted-foreground hover:text-foreground" data-testid="button-sign-in">
        Sign in with your own account
      </Button>
    </div>
  );
}

function AppShellRouter() {
  const { isLoading, isAuthenticated, user } = useAuth();

  // Show role picker only for authenticated users who haven't chosen a role yet.
  if (!isLoading && isAuthenticated && !user?.role) {
    return <RolePicker />;
  }

  // A brief loading state keeps the layout stable while the auth state resolves.
  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground animate-pulse">Loading…</p>
        </div>
      </AppLayout>
    );
  }

  // The in-app pages depend on authenticated API routes, so anonymous
  // visitors get a sign-in prompt instead of broken/empty pages.
  if (!isAuthenticated) {
    return <SignInPrompt />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/demo" component={Dashboard} />
        <Route path="/demo/deals" component={DealsList} />
        <Route path="/demo/deals/new" component={DealCreate} />
        <Route path="/demo/deals/:id" component={DealDetail} />
        <Route path="/demo/access-requests" component={AccessRequests} />
        <Route path="/demo/mandates" component={Mandates} />
        <Route path="/demo/mandates/:id/matches" component={MandateMatches} />
        <Route path="/demo/assignments" component={Assignments} />
        <Route path="/demo/brokers" component={Brokers} />
        <Route path="/demo/brokers/:id" component={BrokerDetail} />
        <Route path="/demo/professionals" component={Professionals} />
        <Route path="/demo/engagements" component={Engagements} />
        <Route path="/demo/checklist-templates" component={ChecklistTemplates} />
        <Route path="/demo/professionals/:id" component={BrokerDetail} />
        <Route path="/demo/messages" component={Messages} />
        <Route path="/demo/transactions" component={Transactions} />
        <Route path="/demo/profile" component={BrokerProfile} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function MainRouter() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/demo/*" component={AppShellRouter} />
      <Route path="/demo" component={AppShellRouter} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <MainRouter />
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
