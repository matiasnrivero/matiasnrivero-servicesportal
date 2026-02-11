import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

type Notification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  metadata: any;
  createdAt: string;
};

type DefaultUser = {
  userId: string;
  username: string;
  role: string;
};

const PAGE_SIZE = 20;

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: currentUser } = useQuery<DefaultUser>({
    queryKey: ["/api/default-user"],
    queryFn: async () => {
      const res = await fetch("/api/default-user");
      if (!res.ok) throw new Error("Failed to get user");
      return res.json();
    },
  });

  const userId = currentUser?.userId;

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count", userId],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unread count");
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!userId,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((total, page) => total + page.length, 0);
    },
    enabled: isOpen && !!userId,
  });

  const notifications = data?.pages.flat() ?? [];

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count", userId] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count", userId] });
    },
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      try {
        const url = new URL(notification.link, window.location.origin);
        setLocation(url.pathname + url.search);
      } catch {
        setLocation(notification.link);
      }
    }
    setIsOpen(false);
  };

  const count = unreadCount?.count ?? 0;

  return (
    <>
      <div className="relative">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsOpen(true)}
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
        </Button>
        {count > 0 && (
          <span
            className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 pointer-events-none ring-2 ring-background"
            data-testid="notification-unread-dot"
          />
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="relative w-96 max-w-[90vw] h-full bg-background border-l shadow-lg flex flex-col animate-in slide-in-from-right duration-200"
            data-testid="notification-sidebar"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending || count === 0}
                  data-testid="button-mark-all-read"
                >
                  Mark all as read
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  data-testid="button-close-notifications"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto"
            >
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : isError ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  Failed to load notifications
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                <>
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left border-b hover-elevate active-elevate-2"
                      data-testid={`notification-item-${notification.id}`}
                    >
                      {!notification.isRead && (
                        <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                      )}
                      {notification.isRead && (
                        <span className="mt-2 h-2 w-2 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${notification.isRead ? "text-muted-foreground" : ""}`}>
                          {notification.title}
                        </p>
                        <p className={`text-xs mt-0.5 line-clamp-2 ${notification.isRead ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  ))}
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      Loading more...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
