import { io } from "socket.io-client";

const SOCKET_URL = `http://${window.location.hostname}:3005`;

export const getSocket = () => {
  const token = localStorage.getItem("token");
  return io(SOCKET_URL, {
    auth: {
      token,
    },
  });
};
