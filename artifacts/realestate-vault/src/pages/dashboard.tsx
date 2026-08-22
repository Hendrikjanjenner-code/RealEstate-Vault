import { useGetDashboardStats, useListActivity } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Key, ScrollText, FileText, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { Link } from "wouter";

const CHART = {
  accent: "#14A87D",
  muted: "#9AA0A6",
  deep: "#22262B",
  surface: "#17191C",
};

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useListActivity();

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-px">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-80 col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const metrics: { label: string; value: string | number; icon: React.ReactNode; href: string }[] = [
    { label: "Active Deals", value: stats.activeDeals, icon: <Briefcase className="w-3.5 h-3.5" />, href: "/demo/deals" },
    { label: "Access Requests", value: stats.accessRequests, icon: <Key className="w-3.5 h-3.5" />, href: "/demo/access-requests" },
    { label: "NDAs Signed", value: stats.ndasSigned, icon: <ScrollText className="w-3.5 h-3.5" />, href: "/demo/access-requests" },
    { label: "Pipeline Value", value: `€${(stats.pipelineValue / 1000000).toFixed(1)}M`, icon: <Activity className="w-3.5 h-3.5" />, href: "/demo/deals" },
    { label: "Active Mandates", value: stats.activeMandates, icon: <FileText className="w-3.5 h-3.5" />, href: "/demo/mandates" },
    { label: "Unread Messages", value: stats.unreadMessages, icon: <Activity className="w-3.5 h-3.5" />, href: "/demo/messages" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            {user?.firstName ? `Welcome back, ${user.firstName}` : user?.email ? `Welcome back, ${user.email}` : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your pipeline, requests and activity at a glance.</p>
        </div>
      </div>

      {/* Metric strip: dense, single bordered row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border border-border rounded-md overflow-hidden bg-card divide-x divide-y lg:divide-y-0 divide-border">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href} className="px-4 py-3.5 block hover:bg-white/[0.03] focus-visible:bg-white/[0.03] outline-none transition-colors" data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {m.icon}
              <span className="text-[11px] font-medium uppercase tracking-wider">{m.label}</span>
            </div>
            <div className="mt-1 text-xl font-heading font-bold text-foreground [font-feature-settings:'tnum'_1,'lnum'_1]">{m.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="col-span-2 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Deal Activity</CardTitle>
            <CardDescription className="text-xs">Views and requests over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.dealActivity}>
                <XAxis dataKey="date" stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ backgroundColor: CHART.surface, borderColor: CHART.deep, borderRadius: '6px' }}
                  itemStyle={{ color: '#F6F4EF' }}
                />
                <Line type="monotone" dataKey="views" stroke={CHART.accent} strokeWidth={1.75} dot={false} />
                <Line type="monotone" dataKey="requests" stroke={CHART.muted} strokeWidth={1.75} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center justify-between">
              Recent Activity
              <Link href="/demo/deals" className="text-xs font-normal text-muted-foreground hover:text-primary transition-colors">View all</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {activityLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {activity?.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                    <div className="mt-0.5 text-muted-foreground">
                      {item.type === 'nda_signed' ? <ScrollText className="w-3.5 h-3.5" /> :
                       item.type === 'access_request' ? <Key className="w-3.5 h-3.5" /> :
                       item.type === 'document_viewed' ? <FileText className="w-3.5 h-3.5" /> :
                       <Activity className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground leading-snug">{item.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 [font-feature-settings:'tnum'_1]">
                        {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Asset Class Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.assetClassBreakdown} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="assetClass" type="category" stroke="#F6F4EF" fontSize={11} tickLine={false} axisLine={false} width={90} />
              <Tooltip cursor={{ fill: '#ffffff08' }} contentStyle={{ backgroundColor: CHART.surface, borderColor: CHART.deep, borderRadius: '6px' }} />
              <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={16}>
                {stats.assetClassBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? CHART.accent : CHART.deep} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
