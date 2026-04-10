import { motion, AnimatePresence } from "framer-motion";
import { X, Trophy, Zap, Target, TrendingUp, Clock, Star } from "lucide-react";

interface MatchHistory {
  game: string;
  result: "win" | "loss" | "draw";
  stake: number;
  date: string;
}

interface PlayerProfile {
  id: string;
  username: string;
  avatar: string;
  level: number;
  totalWins: number;
  totalLosses: number;
  winStreak: number;
  totalEarnings: number;
  gamesPlayed: number;
  favoriteGame: string;
  joinDate: string;
  matchHistory: MatchHistory[];
}

const MOCK_PROFILES: Record<string, PlayerProfile> = {
  default: {
    id: "1",
    username: "Player_42",
    avatar: "P",
    level: 12,
    totalWins: 45,
    totalLosses: 23,
    winStreak: 5,
    totalEarnings: 4500,
    gamesPlayed: 68,
    favoriteGame: "Dice Battle",
    joinDate: "Jan 2025",
    matchHistory: [
      { game: "Dice Battle", result: "win", stake: 200, date: "5 min ago" },
      { game: "Bingo", result: "loss", stake: 500, date: "1 hour ago" },
      { game: "RPS", result: "win", stake: 100, date: "2 hours ago" },
      { game: "Guess My Number", result: "win", stake: 200, date: "Yesterday" },
      { game: "Dice Battle", result: "draw", stake: 100, date: "Yesterday" },
      { game: "Bingo", result: "win", stake: 500, date: "2 days ago" },
    ],
  },
};

interface PlayerProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  playerId?: string | null;
  playerName?: string | null;
}

const PlayerProfileSheet = ({ isOpen, onClose, playerId, playerName }: PlayerProfileSheetProps) => {
  const profile = MOCK_PROFILES["default"];
  const displayProfile = playerName
    ? { ...profile, username: playerName, avatar: playerName.charAt(0).toUpperCase() }
    : profile;


  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[80]"
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 max-h-[85vh] z-[90] bg-background border-t border-border rounded-t-2xl flex flex-col overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.1 }}
                    className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-lg font-display font-bold text-primary-foreground"
                  >
                    {displayProfile.avatar}
                  </motion.div>
                  <div>
                    <h2 className="font-display font-bold text-foreground text-lg">{displayProfile.username}</h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary font-display font-bold">
                        Lvl {displayProfile.level}
                      </span>
                      <span>Joined {displayProfile.joinDate}</span>
                    </div>
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </motion.button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { icon: Trophy, label: "Wins", value: displayProfile.totalWins, color: "text-primary" },
                  { icon: Star, label: "Level", value: displayProfile.level, color: "text-accent" },
                  { icon: Zap, label: "Streak", value: displayProfile.winStreak, color: "text-secondary" },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05 }}
                    className="card-game rounded-xl p-3 text-center"
                  >
                    <stat.icon className={`w-4 h-4 mx-auto mb-1 ${stat.color}`} />
                    <p className={`text-xl font-display font-extrabold ${stat.color}`}>{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground font-display">{stat.label}</p>
                  </motion.div>
                ))}
              </div>

              {/* Extra Stats */}
              <div className="grid grid-cols-1 gap-2 mb-5">
                {[
                  { icon: TrendingUp, label: "Total Earnings", value: `${displayProfile.totalEarnings.toLocaleString()} ETB` },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className="card-game rounded-xl p-3 flex items-center gap-2.5"
                  >
                    <stat.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-display font-bold text-foreground">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Favorite Game */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="card-game rounded-xl p-3 mb-5 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center p-1.5">
                  <img src="/logo.png" className="w-full h-full object-contain drop-shadow" alt="Favorite Game" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Favorite Game</p>
                  <p className="text-sm font-display font-bold text-foreground">{displayProfile.favoriteGame}</p>
                </div>
              </motion.div>

              {/* Match History */}
              <div className="mb-2">
                <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Recent Matches
                </p>
                <div className="space-y-1.5">
                  {displayProfile.matchHistory.map((match, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.45 + i * 0.04 }}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        match.result === "win" ? "bg-primary" : match.result === "loss" ? "bg-destructive" : "bg-muted-foreground"
                      }`} />
                      <span className="text-xs font-display font-semibold text-foreground flex-1">{match.game}</span>
                      <span className={`text-xs font-display font-bold ${
                        match.result === "win" ? "text-primary" : match.result === "loss" ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {match.result === "win" ? `+${match.stake} ETB` : match.result === "loss" ? `-${match.stake} ETB` : "0 ETB"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{match.date}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PlayerProfileSheet;
