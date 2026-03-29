import { motion } from "framer-motion";
import { ArrowLeft, Gamepad2, DollarSign, Bell, Trophy, UserPlus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface Notification {
  id: string;
  type: "invite" | "result" | "system" | "deposit" | string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

const iconMap = {
  invite: UserPlus,
  result: Trophy,
  system: Bell,
  deposit: DollarSign,
};

const NotificationsPage = () => {
  const token = localStorage.getItem("token") || "";
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications", token),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`, {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.put("/notifications/read-all", {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = () => {
    markAllReadMutation.mutate();
  };

  const dismiss = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const unreadCount = notifications.filter((n: Notification) => !n.read).length;

  return (
    <div className="px-4 pt-6 pb-24">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-primary font-display font-semibold">{unreadCount} unread</p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={markAllRead}
            className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-display font-bold"
          >
            Mark all read
          </motion.button>
        )}
      </motion.div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="card-game rounded-xl p-8 text-center">
            <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n: Notification, i: number) => {
            const Icon = iconMap[n.type as keyof typeof iconMap] || Bell;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  if (!n.read) markReadMutation.mutate(n.id);
                }}
                className={`card-game rounded-xl p-3.5 flex items-start gap-3 relative cursor-pointer transition-colors hover:bg-muted/50 ${!n.read ? "ring-1 ring-primary/30" : ""}`}
              >
                {!n.read && <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  n.type === "invite" ? "bg-secondary/20" :
                  n.type === "result" ? "bg-accent/20" :
                  n.type === "deposit" ? "bg-primary/20" : "bg-muted"
                }`}>
                  <Icon className={`w-4 h-4 ${
                    n.type === "invite" ? "text-secondary" :
                    n.type === "result" ? "text-accent" :
                    n.type === "deposit" ? "text-primary" : "text-muted-foreground"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(n.createdAt))}
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(n.id);
                  }}
                  className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-1"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </motion.button>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
