import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { useSetMyRole } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { VaultLogo } from '@/components/logo';
import { Briefcase, Search } from 'lucide-react';
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
import Brokers from '@/pages/brokers';
import Messages from '@/pages/messages';
import Transactions from '@/pages/transactions';
import NotFound from '@/pages/not-found';

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
      <VaultLogo className="h-12 w-12" />
      {children}
    </div>
  );
}

function RolePicker() {
  const setRole = useSetMyRole();

  const choose = (role: 'broker' | 'investor') => {
    setRole.mutate(
      { data: { role } },
      { onSuccess: () => window.location.reload() },
    );
  };

  return (
    <AuthScreen>
      <h1 className="text-2xl font-heading font-bold">How will you use RealEstate Vault?</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Choose your role to continue. Brokers list deals and manage data room access; investors request access to confidential opportunities.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button size="lg" disabled={setRole.isPending} onClick={() => choose('broker')} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8">
          <Briefcase className="w-5 h-5 mr-2" /> I'm a Broker
        </Button>
        <Button size="lg" variant="outline" disabled={setRole.isPending} onClick={() => choose('investor')} className="border-primary/30 px-8">
          <Search className="w-5 h-5 mr-2" /> I'm an Investor
        </Button>
      </div>
      {setRole.isError && (
        <p className="text-sm text-destructive">Could not save your role. Please try again.</p>
      )}
    </AuthScreen>
  );
}

function AppShellRouter() {
  const { isLoading, isAuthenticated, user, login } = useAuth();

  if (isLoading) {
    return (
      <AuthScreen>
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </AuthScreen>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen>
        <h1 className="text-2xl font-heading font-bold">Members Only</h1>
        <p className="text-muted-foreground max-w-md text-center">
          RealEstate Vault is a private marketplace. Sign in to view deals and request access to confidential data rooms.
        </p>
        <Button size="lg" onClick={login} className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 font-bold">
          Sign In
        </Button>
      </AuthScreen>
    );
  }

  if (!user?.role) {
    return <RolePicker />;
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
        <Route path="/demo/brokers" component={Brokers} />
        <Route path="/demo/messages" component={Messages} />
        <Route path="/demo/transactions" component={Transactions} />
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
