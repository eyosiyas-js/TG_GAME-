import { motion } from "framer-motion";
import { Users, Crown, XCircle } from "lucide-react";

interface Player {
  name: string;
  isHost: boolean;
  isReady: boolean;
  avatar: string;
  userId?: string;
}

interface GameLobbyProps {
  players: Player[];
  isHost: boolean;
  myUserId: string;
  onStart: () => void;
  onKick?: (userId: string) => void;
  onToggleReady?: () => void;
  maxPlayers: number;
}

const GameLobby = ({ players, isHost, myUserId, onStart, onKick, onToggleReady, maxPlayers }: GameLobbyProps) => {
  const nonHostPlayers = players.filter(p => !p.isHost);
  const allNonHostReady = nonHostPlayers.length > 0 && nonHostPlayers.every(p => p.isReady);
  const canStart = isHost && players.length >= 2 && allNonHostReady;

  const myPlayer = players.find(p => p.userId === myUserId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
          Players in Lobby
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>{players.length}/{maxPlayers}</span>
        </div>
      </div>

      <div className="space-y-2">
        {players.map((player, i) => (
          <motion.div
            key={player.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="w-full card-game rounded-xl p-3 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-display font-bold text-primary-foreground relative">
              {player.avatar}
              {player.isHost && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                  <Crown className="w-2.5 h-2.5 text-accent-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-display font-semibold text-foreground">{player.name}</p>
              <p className="text-xs text-muted-foreground">
                {player.isHost ? "Host" : "Player"}
              </p>
            </div>
            <span className={`text-xs font-display font-semibold ${
              player.isHost ? "text-accent" : player.isReady ? "text-primary" : "text-muted-foreground"
            }`}>
              {player.isHost ? "Host" : player.isReady ? "Ready ✓" : "Not Ready"}
            </span>
            {/* Kick button — only visible to host, for non-host players */}
            {isHost && !player.isHost && player.userId && onKick && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={(e) => { e.stopPropagation(); onKick(player.userId!); }}
                className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                title="Kick player"
              >
                <XCircle className="w-3.5 h-3.5 text-destructive" />
              </motion.button>
            )}
          </motion.div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: maxPlayers - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="card-game rounded-xl p-3 flex items-center gap-3 opacity-30">
            <div className="w-10 h-10 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center">
              <span className="text-xs text-muted-foreground">?</span>
            </div>
            <span className="text-sm text-muted-foreground font-display">Waiting for player...</span>
          </div>
        ))}
      </div>

      {/* Host: Start Game button */}
      {isHost && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onStart}
          disabled={!canStart}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary disabled:opacity-50 disabled:shadow-none"
        >
          {players.length < 2
            ? "Waiting for players..."
            : !allNonHostReady
            ? "Waiting for players to ready up..."
            : "Start Game"}
        </motion.button>
      )}

      {/* Non-host: Ready / Waiting */}
      {!isHost && onToggleReady && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onToggleReady}
          className={`w-full py-4 rounded-2xl font-display font-extrabold text-lg transition-all ${
            myPlayer?.isReady
              ? "bg-accent text-accent-foreground"
              : "bg-primary text-primary-foreground glow-primary"
          }`}
        >
          {myPlayer?.isReady ? "Ready ✓ (tap to unready)" : "Ready Up"}
        </motion.button>
      )}
    </div>
  );
};

export default GameLobby;
