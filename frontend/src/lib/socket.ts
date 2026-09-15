import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3005";

export const getSocket = () => {
  const token = localStorage.getItem("token");

  // When SOCKET_URL is a path like "/api", we need to tell Socket.IO
  // to use it as the transport path, not as a namespace
  const isRelativePath = SOCKET_URL.startsWith("/");

  return io(isRelativePath ? "/" : SOCKET_URL, {
    auth: {
      token,
    },
    ...(isRelativePath && {
      path: `${SOCKET_URL}/socket.io`,
    }),
  });
};
