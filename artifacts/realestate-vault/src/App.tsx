import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

function AppShellRouter() {
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
