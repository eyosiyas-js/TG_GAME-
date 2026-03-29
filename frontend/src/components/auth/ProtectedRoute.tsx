import { Navigate, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";

const ProtectedRoute = () => {
  const isAuthenticated = !!localStorage.getItem("token");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = getSocket();

    socket.on("notification", (notification: any) => {
      // Invalidate the query so the dot updates on the bell icon in AppLayout if we have one
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      // Show toast
      toast(notification.title, {
        description: notification.message,
        action: { label: "View", onClick: () => window.location.href = "/notifications" }
      });
    });

    return () => {
      socket.off("notification");
      socket.disconnect();
    };
  }, [isAuthenticated, queryClient]);

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
