import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Medal, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface LeaderboardEntry {
  rank: number;
  name: string;
  wins: number;
  earnings: number;
  isYou: boolean;
}

const rankColors: Record<number, string> = {
  1: "text-accent",
  2: "text-muted-foreground",
  3: "text-orange-400",
};

const Leaderboard = () => {
  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await api.get("/auth/leaderboard");
      // Map 'isYou' based on local storage
      return res.map((entry: any) => ({
        ...entry,
        isYou: entry.name === localStorage.getItem("username")
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const top3 = leaderboardData ? [leaderboardData[1], leaderboardData[0], leaderboardData[2]].filter(Boolean) : [];

  return (
    <div className="px-4 pt-6 pb-12">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 mb-6">
        <Link to="/" className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
        </Link>
        <h1 className="text-xl font-display font-bold text-foreground">Leaderboard</h1>
      </motion.div>

      {/* Top 3 Podium */}
      {top3.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-center gap-3 mb-8"
        >
          {top3.map((player, i) => {
            const heights = ["h-20", "h-28", "h-16"];
            const sizes = ["w-12 h-12 text-lg", "w-16 h-16 text-xl", "w-12 h-12 text-lg"];
            if (!player) return null;
            return (
              <div key={player.rank} className="flex flex-col items-center">
                <div
                  className={`${sizes[i]} rounded-full bg-gradient-to-br from-muted to-card flex items-center justify-center font-display font-extrabold text-foreground border-2 ${
                    player.rank === 1 ? "border-accent" : "border-border"
                  } mb-2 shadow-lg`}
                >
                  {player.name[0]?.toUpperCase()}
                </div>
                <p className="text-xs font-display font-bold text-foreground truncate max-w-[80px]">{player.name}</p>
                <div
                  className={`${heights[i]} w-20 mt-2 rounded-t-xl bg-gradient-to-t ${
                    player.rank === 1
                      ? "from-accent/10 to-accent/30 shadow-[0_-10px_20px_-5px_hsl(var(--accent)/0.2)]"
                      : player.rank === 2
                      ? "from-muted to-muted/80"
                      : "from-orange-400/10 to-orange-400/20"
                  } flex flex-col items-center justify-end pb-2`}
                >
                  <span className={`text-lg font-display font-extrabold ${rankColors[player.rank] || "text-foreground"}`}>
                    #{player.rank}
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Full List */}
      <div className="space-y-2">
        {leaderboardData?.map((player: LeaderboardEntry, i: number) => (
          <motion.div
            key={player.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`card-game rounded-xl p-3 flex items-center gap-3 ${
              player.isYou ? "ring-2 ring-primary bg-primary/5" : ""
            }`}
          >
            <span
              className={`w-7 text-center font-display font-extrabold text-xs ${
                rankColors[player.rank] || "text-muted-foreground"
              }`}
            >
              {player.rank <= 3 ? (
                <Trophy className={`w-4 h-4 mx-auto ${rankColors[player.rank]}`} />
              ) : (
                `#${player.rank}`
              )}
            </span>
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-display font-bold text-foreground border border-border">
              {player.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-semibold text-foreground truncate">
                {player.name}
                {player.isYou && <span className="text-primary ml-1 text-[10px] font-bold uppercase tracking-tighter">(You)</span>}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{player.wins} matches played</p>
            </div>
            <p className="text-sm font-display font-bold text-primary font-mono">${player.earnings.toLocaleString()}</p>
          </motion.div>
        ))}
      </div>

      {(!leaderboardData || leaderboardData.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-2 opacity-20" />
          <p>No data yet. Start playing!</p>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
