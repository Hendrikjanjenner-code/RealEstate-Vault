import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, FileSignature, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function iconFor(message: string) {
  if (message.includes("approved")) return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
  if (message.includes("declined")) return <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />;
  if (message.includes("NDA")) return <FileSignature className="w-4 h-4 text-primary shrink-0 mt-0.5" />;
  return <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: notifications } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 30000 },
  });
  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListNotificationsQueryKey(),
        });
      },
    },
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && unreadCount > 0) {
      markRead.mutate();
    }
  };

  const handleNotificationClick = (n: {
    dealId?: number | null;
    accessRequestId?: number | null;
  }) => {
    setOpen(false);
    if (n.dealId != null) {
      navigate(`/demo/deals/${n.dealId}`);
    } else if (n.accessRequestId != null) {
      navigate("/demo/access-requests");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              data-testid="badge-unread-count"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-heading font-semibold text-sm">Notifications</h3>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                data-testid={`notification-item-${n.id}`}
                onClick={() => handleNotificationClick(n)}
                disabled={n.dealId == null && n.accessRequestId == null}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors enabled:cursor-pointer enabled:hover:bg-accent/50 disabled:cursor-default ${
                  n.read ? "" : "bg-primary/5"
                }`}
              >
                {iconFor(n.message)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
