import { motion } from "framer-motion";
import { Users, DollarSign, Clock, Plus, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface Room {
  id: string;
  host: string;
  name: string;
  players: number;
  maxPlayers: number;
  stake: number;
  gameType: string;
  status: "waiting" | "in-progress";
}

interface PublicRoomsProps {
  gameName: string;
  gameType: string;
  maxPlayers: number;
  onJoin: (roomId: string) => void;
  onCreate: () => void;
  socketRef: React.MutableRefObject<any>;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

const PublicRooms = ({ gameName, gameType, maxPlayers, onJoin, onCreate, socketRef }: PublicRoomsProps) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRooms = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    setLoading(true);
    socket.emit("listRooms", { gameType });
  }, [socketRef, gameType]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleRoomList = (data: Room[]) => {
      setRooms(data);
      setLoading(false);
    };

    socket.on("roomList", handleRoomList);

    // Fetch on mount and every 5 seconds
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);

    return () => {
      socket.off("roomList", handleRoomList);
      clearInterval(interval);
    };
  }, [socketRef.current, fetchRooms]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
          Public Rooms
        </p>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={fetchRooms}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </motion.button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="card-game rounded-xl p-6 text-center">
          <p className="text-sm text-muted-foreground">No public rooms available</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to get started!</p>
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
          {rooms.map((room) => (
            <motion.div
              key={room.id}
              variants={item}
              className="card-game rounded-xl p-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-sm font-display font-bold text-foreground">
                {room.host.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-semibold text-foreground truncate">
                  {room.name || `${room.host}'s Room`}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.players}/{room.maxPlayers}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    ${room.stake}
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    <Clock className="w-3 h-3" />
                    Waiting
                  </span>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onJoin(room.id)}
                disabled={room.players >= room.maxPlayers}
                className={`px-4 py-2 rounded-lg font-display font-bold text-xs transition-all ${
                  room.players < room.maxPlayers
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground opacity-50"
                }`}
              >
                {room.players >= room.maxPlayers ? "Full" : "Join"}
              </motion.button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default PublicRooms;
