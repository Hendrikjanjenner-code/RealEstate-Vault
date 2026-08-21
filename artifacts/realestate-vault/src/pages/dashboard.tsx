import { useGetDashboardStats, useListActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Key, ScrollText, Users, FileText, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useListActivity();

  if (statsLoading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96 col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Welcome back, Alexander</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening in your vault today.</p>
        </div>
        <div className="flex gap-4">
          {/* Quick actions could go here */}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Active Deals" value={stats.activeDeals} icon={<Briefcase className="w-5 h-5 text-primary" />} />
        <StatsCard title="Access Requests" value={stats.accessRequests} icon={<Key className="w-5 h-5 text-primary" />} />
        <StatsCard title="NDAs Signed" value={stats.ndasSigned} icon={<ScrollText className="w-5 h-5 text-primary" />} />
        <StatsCard title="Pipeline Value" value={`€${(stats.pipelineValue / 1000000).toFixed(1)}M`} icon={<Activity className="w-5 h-5 text-primary" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 bg-card/50 backdrop-blur border-white/5">
          <CardHeader>
            <CardTitle className="font-heading">Deal Activity</CardTitle>
            <CardDescription>Views and requests over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.dealActivity}>
                <XAxis dataKey="date" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111518', borderColor: '#C8A95A', borderRadius: '8px' }}
                  itemStyle={{ color: '#F3F0E6' }}
                />
                <Line type="monotone" dataKey="views" stroke="#C8A95A" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="requests" stroke="#0B2D26" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-white/5 flex flex-col">
          <CardHeader>
            <CardTitle className="font-heading flex items-center justify-between">
              Recent Activity
              <span className="text-xs font-normal text-muted-foreground cursor-pointer hover:text-primary transition-colors">View all</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {activityLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-6">
                {activity?.map((item) => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="mt-0.5 p-2 rounded-full bg-primary/10 text-primary">
                      {item.type === 'nda_signed' ? <ScrollText className="w-4 h-4" /> :
                       item.type === 'access_request' ? <Key className="w-4 h-4" /> :
                       item.type === 'document_viewed' ? <FileText className="w-4 h-4" /> :
                       <Activity className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 bg-card/50 backdrop-blur border-white/5">
          <CardHeader>
            <CardTitle className="font-heading">Asset Class Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={stats.assetClassBreakdown} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                 <XAxis type="number" hide />
                 <YAxis dataKey="assetClass" type="category" stroke="#F3F0E6" fontSize={12} tickLine={false} axisLine={false} width={80} />
                 <Tooltip cursor={{fill: '#ffffff10'}} contentStyle={{ backgroundColor: '#111518', borderColor: '#164033', borderRadius: '8px' }} />
                 <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                   {stats.assetClassBreakdown.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={index === 0 ? '#C8A95A' : '#164033'} />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <div className="col-span-2 grid grid-cols-2 gap-6">
           <Card className="bg-card/50 backdrop-blur border-white/5 flex flex-col justify-center items-center text-center p-6">
             <div className="p-4 rounded-full bg-primary/10 text-primary mb-4">
               <FileText className="w-8 h-8" />
             </div>
             <h3 className="text-3xl font-heading font-bold">{stats.activeMandates}</h3>
             <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium mt-2">Active Mandates</p>
           </Card>
           <Card className="bg-card/50 backdrop-blur border-white/5 flex flex-col justify-center items-center text-center p-6">
             <div className="p-4 rounded-full bg-primary/10 text-primary mb-4">
               <Users className="w-8 h-8" />
             </div>
             <h3 className="text-3xl font-heading font-bold">{stats.unreadMessages}</h3>
             <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium mt-2">Unread Messages</p>
           </Card>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <Card className="bg-card/50 backdrop-blur border-white/5 overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-6 flex items-center justify-between relative z-10">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <h3 className="text-3xl font-heading font-bold text-foreground">{value}</h3>
        </div>
        <div className="p-3 bg-background rounded-xl border border-white/5 shadow-inner">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
