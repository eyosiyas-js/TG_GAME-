import { motion } from "framer-motion";
import { Clock, Trophy, XCircle, Gamepad2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const Games = () => {
  const token = localStorage.getItem("token") || "";
  
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["game-history"],
    queryFn: () => api.get("/game/history", token),
  });

  const { data: activeGames, isLoading: activeLoading } = useQuery({
    queryKey: ["active-games"],
    queryFn: () => api.get("/game/active", token),
  });

  if (historyLoading || activeLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const userId = localStorage.getItem("userId");

  return (
    <div className="px-4 pt-6 pb-20">
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-xl font-display font-bold text-foreground mb-6"
      >
        My Games
      </motion.h1>

      {/* Active Games */}
      {activeGames && activeGames.length > 0 && (
        <motion.div variants={container} initial="hidden" animate="show" className="mb-8">
          <motion.h3 variants={item} className="text-sm font-display font-bold text-foreground mb-3">
            Current Lobby Activity
          </motion.h3>
          {activeGames.map((g: any) => (
            <motion.div
              key={g.id}
              variants={item}
              className="card-game rounded-2xl p-4 flex items-center gap-3 animate-pulse-glow mb-2"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Gamepad2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-foreground truncate">{g.gameType}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{g.participants.length}/2 Players</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-display font-bold text-primary">${Number(g.stake).toLocaleString()}</p>
                <p className="text-[10px] text-accent uppercase font-bold animate-pulse">Running</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Match History */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.h3 variants={item} className="text-sm font-display font-bold text-foreground mb-3">
          Match History
        </motion.h3>
        <div className="space-y-2">
          {history && history.length > 0 ? history.map((match: any) => {
            const isWinner = match.winnerId === userId;
            const opponent = match.participants.find((p: any) => p.userId !== userId)?.user?.username || "Opponent";
            const timeAgo = new Date(match.createdAt).toLocaleDateString();
            
            return (
              <motion.div
                key={match.id}
                variants={item}
                className="card-game rounded-xl p-3 flex items-center gap-3 border border-border/50"
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isWinner ? "bg-primary/20" : "bg-destructive/20"
                  }`}
                >
                  {isWinner ? (
                    <Trophy className="w-4 h-4 text-primary" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold text-foreground truncate">{match.gameType}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-tighter">
                    <span>vs {opponent}</span>
                    <span>•</span>
                    <Clock className="w-3 h-3" />
                    <span>{timeAgo}</span>
                  </div>
                </div>
                <p
                  className={`text-sm font-display font-bold ${
                    isWinner ? "text-primary" : "text-destructive"
                  }`}
                >
                  {isWinner ? "+" : "-"}${Number(
                    isWinner && match.transactions?.length > 0 
                      ? match.transactions[0].amount - Number(match.stake)
                      : match.stake
                  ).toLocaleString()}
                </p>
              </motion.div>
            );
          }) : (
            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-2xl border-2 border-dashed border-border">
               <Gamepad2 className="w-12 h-12 mx-auto mb-2 opacity-10" />
               <p className="text-sm">No matches played yet.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Games;
