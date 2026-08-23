import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Shield, LayoutDashboard, Briefcase, Users, FileText, Send, Handshake, LogOut, UserRound, Building2 } from "lucide-react";
import { BrandLogo } from "@/components/logo";
import { brand } from "@workspace/brand";
import { NotificationsBell } from "@/components/notifications-bell";
import { useAuth } from "@workspace/replit-auth-web";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Member";
  const initials =
    displayName
      .split(" ")
      .map((p: string) => p.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "M";

  const navItems =
    user?.role === "owner"
      ? [
          { label: "Dashboard", href: "/demo", icon: LayoutDashboard },
          { label: "My Properties", href: "/demo/assignments", icon: Building2 },
          { label: "Find Professionals", href: "/demo/professionals", icon: Users },
          { label: "Messages", href: "/demo/messages", icon: Send },
          { label: "Transactions", href: "/demo/transactions", icon: Handshake },
        ]
      : [
          { label: "Dashboard", href: "/demo", icon: LayoutDashboard },
          ...(user?.role === "broker"
            ? [
                { label: "My Profile", href: "/demo/profile", icon: UserRound },
                { label: "Owner Assignments", href: "/demo/assignments", icon: Building2 },
              ]
            : []),
          { label: "Deals", href: "/demo/deals", icon: Briefcase },
          { label: "Mandates", href: "/demo/mandates", icon: FileText },
          { label: "Professionals", href: "/demo/professionals", icon: Users },
          { label: "My Engagements", href: "/demo/engagements", icon: Handshake },
          { label: "Messages", href: "/demo/messages", icon: Send },
          { label: "Transactions", href: "/demo/transactions", icon: Handshake },
          { label: "Access Requests", href: "/demo/access-requests", icon: Shield },
        ];

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background dark text-foreground selection:bg-primary/30">
        <Sidebar className="border-r border-border bg-sidebar">
          <SidebarHeader className="h-16 flex items-center px-4 border-b border-sidebar-border">
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <BrandLogo markClassName="h-7 w-7" textClassName="text-base" />
            </Link>
          </SidebarHeader>
          <SidebarContent className="px-2 py-4">
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/demo" && location.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className="transition-all duration-200"
                    >
                      <Link href={item.href}>
                        <item.icon className="w-4 h-4 mr-2" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border border-sidebar-accent">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</span>
                <span className="text-xs text-sidebar-foreground/60 truncate">{user?.email || (user?.role === "broker" ? "Broker" : user?.role === "owner" ? "Owner" : "Investor")}</span>
              </div>
            </div>
            <Button onClick={logout} variant="ghost" className="w-full mt-4 justify-start text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
            {user?.role && (
              <div className="mt-4 flex items-center justify-center">
                <div className="px-2 py-1 rounded border border-primary/20 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                  {user.role === "broker" ? "Broker Account" : user.role === "owner" ? "Owner Account" : "Investor Account"}
                </div>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 sticky top-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-2" />
              <h1 className="text-lg font-heading font-semibold capitalize tracking-wide text-foreground/90">
                {navItems.find((item) => location === item.href || (item.href !== "/demo" && location.startsWith(item.href)))?.label || brand.name}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <NotificationsBell />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
