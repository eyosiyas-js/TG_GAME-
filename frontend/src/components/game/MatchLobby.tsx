import { motion } from "framer-motion";
import { ArrowLeft, Users, Lock, Globe, Zap, Copy, MessageCircle, UserPlus, DollarSign, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import PublicRooms from "@/components/game/PublicRooms";
import GameLobby from "@/components/game/GameLobby";
import ChatSystem from "@/components/game/ChatSystem";
import CreateRoomDialog from "@/components/game/CreateRoomDialog";
import { sounds } from "@/components/game/AnimationEffects";
import { getSocket } from "@/lib/socket";

interface MatchLobbyProps {
  gameName: string;
  emoji: string;
  players: string;
  onStart: () => void;
  stake: number;
  onStakeChange: (stake: number) => void;
  gameType: string;
  socketRef?: React.MutableRefObject<any>;
}

type MatchType = "quick" | "private" | "public";
type LobbyView = "select" | "room-lobby";

interface RoomData {
  roomId: string;
  code: string;
  hostId: string;
  hostName: string;
  name: string;
  gameType: string;
  stake: number;
  maxPlayers: number;
  isPublic: boolean;
  players: { userId: string; username: string; isReady: boolean }[];
}

const MatchLobby = ({ gameName, emoji, players, onStart, stake, onStakeChange, gameType, socketRef: externalSocketRef }: MatchLobbyProps) => {
  const navigate = useNavigate();
  const [matchType, setMatchType] = useState<MatchType>("quick");
  const [joinCode, setJoinCode] = useState("");
  const [lobbyView, setLobbyView] = useState<LobbyView>("select");
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [customStake, setCustomStake] = useState(String(stake));
  const quickStakeOptions = [50, 100, 300, 500];

  // Room state
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const internalSocketRef = useRef<any>(null);

  const socketRef = externalSocketRef || internalSocketRef;

  const isBingo = gameName.toLowerCase().includes("bingo");
  const maxPlayers = isBingo ? 4 : 2;

  // Safely get userId from either the top-level key or the parsed user object
  let myUserId = localStorage.getItem("userId") || "";
  if (!myUserId) {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) myUserId = JSON.parse(userStr).id;
    } catch (e) {}
  }

  // Initialize socket if not provided externally
  useEffect(() => {
    if (!externalSocketRef) {
      internalSocketRef.current = getSocket();
      return () => {
        internalSocketRef.current?.disconnect();
      };
    }
  }, [externalSocketRef]);

  // Room socket listeners
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleRoomCreated = (data: any) => {
      setRoomCode(data.code);
      setRoomError(null);
    };

    const handleRoomUpdate = (data: RoomData) => {
      setRoomData(data);
      setRoomCode(data.code);
      setLobbyView("room-lobby");
      setRoomError(null);
    };

    const handleRoomLeft = () => {
      setRoomData(null);
      setRoomCode("");
      setLobbyView("select");
    };

    const handleRoomError = (data: { message: string }) => {
      setRoomError(data.message);
      setTimeout(() => setRoomError(null), 3000);
    };

    const handleRoomKicked = (data: { message: string }) => {
      setRoomData(null);
      setRoomCode("");
      setLobbyView("select");
      setRoomError(data.message || "You were kicked from the room");
      setTimeout(() => setRoomError(null), 4000);
    };

    socket.on("roomCreated", handleRoomCreated);
    socket.on("roomUpdate", handleRoomUpdate);
    socket.on("roomLeft", handleRoomLeft);
    socket.on("roomError", handleRoomError);
    socket.on("roomKicked", handleRoomKicked);

    return () => {
      socket.off("roomCreated", handleRoomCreated);
      socket.off("roomUpdate", handleRoomUpdate);
      socket.off("roomLeft", handleRoomLeft);
      socket.off("roomError", handleRoomError);
      socket.off("roomKicked", handleRoomKicked);
    };
  }, [socketRef.current]);

  const handleStakeInput = (val: string) => {
    setCustomStake(val);
    const num = parseInt(val);
    if (!isNaN(num) && num > 0) onStakeChange(num);
  };

  const handleCreateRoom = (config: { name: string; maxPlayers: number; stake: number }) => {
    setCreateRoomOpen(false);
    socketRef.current?.emit("createRoom", {
      gameType,
      stake: config.stake,
      maxPlayers: config.maxPlayers,
      name: config.name,
      isPublic: matchType === "public",
    });
    onStakeChange(config.stake);
  };

  const handleJoinPublicRoom = (roomId: string) => {
    socketRef.current?.emit("joinRoom", { roomId, gameType });
  };

  const handleJoinPrivateRoom = () => {
    if (joinCode.length < 4) return;
    socketRef.current?.emit("joinRoom", { code: joinCode, gameType });
  };

  const handleLeaveRoom = () => {
    socketRef.current?.emit("leaveRoom");
    setRoomData(null);
    setRoomCode("");
    setLobbyView("select");
  };

  const handleToggleReady = () => {
    socketRef.current?.emit("toggleReady");
  };

  const handleStartRoom = () => {
    socketRef.current?.emit("startRoom");
  };

  const handleKickPlayer = (userId: string) => {
    socketRef.current?.emit("kickPlayer", { userId });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const isHost = roomData?.hostId === myUserId;
  const lobbyPlayers = roomData?.players.map(p => ({
    name: p.username,
    isHost: p.userId === roomData.hostId,
    isReady: p.isReady || p.userId === roomData.hostId,
    avatar: p.username.charAt(0).toUpperCase(),
    userId: p.userId,
  })) || [];

  // Room lobby view
  if (lobbyView === "room-lobby" && roomData) {
    return (
      <div className="px-4 pt-6 min-h-screen flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={handleLeaveRoom} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-display font-bold text-foreground">{roomData.name}</h1>
            <p className="text-xs text-primary font-display font-semibold">{roomData.stake} ETB stake</p>
          </div>
          {/* Room code badge */}
          <button onClick={handleCopyCode} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-display font-bold text-foreground">
            {codeCopied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            {roomData.code}
          </button>
          {/* Chat Button */}
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setChatOpen(true)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center relative">
            <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
            {hasUnreadChat && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />}
          </motion.button>
        </div>

        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-4xl text-center mb-6">
          {emoji}
        </motion.div>

        {/* Error toast */}
        {roomError && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-display font-semibold text-center">
            {roomError}
          </motion.div>
        )}

        <div className="flex-1 mb-24">
          <GameLobby
            players={lobbyPlayers}
            isHost={isHost}
            myUserId={myUserId}
            onStart={handleStartRoom}
            onKick={handleKickPlayer}
            onToggleReady={handleToggleReady}
            maxPlayers={roomData.maxPlayers}
          />
        </div>
        <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["global", "room"]} currentChannel="room" socketRef={socketRef} gameType={gameType} roomId={roomData.roomId} onUnreadMessagesChange={setHasUnreadChat} />
      </div>
    );
  }

  // Match type selection view
  return (
    <div className="px-4 pt-6 min-h-screen flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/")} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold text-foreground">{gameName}</h1>
          <p className="text-xs text-muted-foreground">{players}</p>
        </div>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setChatOpen(true)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center relative">
          <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
          {hasUnreadChat && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />}
        </motion.button>
      </div>

      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl text-center mb-6">
        {emoji}
      </motion.div>

      {/* Error toast */}
      {roomError && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-display font-semibold text-center">
          {roomError}
        </motion.div>
      )}

      {/* Match Type */}
      <div className="mb-6">
        <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2">Match Type</p>
        <div className="flex gap-2">
          {([
            { id: "quick" as const, icon: Zap, label: "Quick" },
            { id: "private" as const, icon: Lock, label: "Private" },
            { id: "public" as const, icon: Globe, label: "Public" },
          ]).map((type) => (
            <button key={type.id} onClick={() => { setMatchType(type.id); sounds.tap(); }} className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all ${matchType === type.id ? "bg-primary text-primary-foreground glow-primary" : "bg-muted text-muted-foreground border border-border"}`}>
              <type.icon className="w-4 h-4" />
              <span className="text-xs font-display font-bold">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bet Amount (quick match) */}
      <div className="mb-6">
        {matchType === "quick" && (
          <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <DollarSign className="w-3 h-3" /> Bet Amount
          </p>
        )}

        {matchType === "quick" ? (
          <div className="flex gap-2">
            {quickStakeOptions.map((option) => (
              <motion.button
                key={option}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  onStakeChange(option);
                  setCustomStake(String(option));
                  sounds.tap();
                }}
                className={`flex-1 py-3 rounded-xl font-display font-bold text-sm transition-all ${
                  stake === option
                    ? "bg-primary text-primary-foreground glow-primary"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {option} ETB
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="relative" />
        )}
      </div>

      {/* Private Room Code */}
      {matchType === "private" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-3">
          <div className="flex gap-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Enter room code..." maxLength={6} className="flex-1 h-12 px-4 rounded-xl bg-muted border border-border text-foreground font-display font-bold tracking-widest uppercase outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={handleJoinPrivateRoom} disabled={joinCode.length < 4} className="h-12 px-4 rounded-xl bg-secondary text-secondary-foreground font-display font-bold text-sm disabled:opacity-50">
              Join
            </button>
          </div>
          <div className="text-center text-xs text-muted-foreground">— or —</div>
        </motion.div>
      )}

      {/* Public Rooms */}
      {matchType === "public" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <PublicRooms gameName={gameName} gameType={gameType} maxPlayers={maxPlayers} onJoin={handleJoinPublicRoom} onCreate={() => setCreateRoomOpen(true)} socketRef={socketRef} />
        </motion.div>
      )}

      {/* Quick Match Player Preview */}
      {matchType === "quick" && (
        <div className="flex-1 mb-6">
          <div className="card-game rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-display font-bold text-muted-foreground">Players</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>1/{maxPlayers}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-display font-bold text-primary-foreground">P</div>
              <span className="text-sm font-display font-semibold text-foreground">You</span>
              <span className="ml-auto text-xs text-primary font-display font-semibold">Ready</span>
            </div>
            <div className="flex items-center gap-3 mt-2 opacity-40">
              <div className="w-10 h-10 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center">
                <span className="text-xs text-muted-foreground">?</span>
              </div>
              <span className="text-sm text-muted-foreground font-display">Waiting...</span>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {matchType === "quick" && (
        <motion.button
          whileTap={{ scale: stake > 0 ? 0.97 : 1 }}
          onClick={stake > 0 ? onStart : undefined}
          disabled={stake === 0}
          className={`w-full py-4 rounded-2xl font-display font-extrabold text-lg mb-24 transition-all ${
            stake > 0
              ? "bg-primary text-primary-foreground glow-primary"
              : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
          }`}
        >
          {stake > 0 ? "Find Match" : "Select Bet Amount"}
        </motion.button>
      )}

      {matchType === "private" && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setCreateRoomOpen(true)}
          className="w-full py-4 rounded-2xl font-display font-extrabold text-lg mb-24 transition-all bg-primary text-primary-foreground glow-primary"
        >
          Create Private Room
        </motion.button>
      )}

      <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["global"]} socketRef={socketRef} gameType={gameType} onUnreadMessagesChange={setHasUnreadChat} />
      <CreateRoomDialog isOpen={createRoomOpen} onClose={() => setCreateRoomOpen(false)} onCreateRoom={handleCreateRoom} gameName={gameName} isBingo={isBingo} />
    </div>
  );
};

export default MatchLobby;
