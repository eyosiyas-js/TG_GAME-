import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:3005";

export const getSocket = () => {
  const token = localStorage.getItem("token");
  return io(SOCKET_URL, {
    auth: {
      token,
    },
  });
};
