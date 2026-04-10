import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { User, Shield, Trophy, Zap, Crown, Star } from "lucide-react";
import { sounds } from "@/components/game/AnimationEffects";
import { getFullUrl } from "@/lib/api";

interface PlayerData {
  name: string;
  avatar?: string;
  level: number;
  wins: number;
  streak: number;
  userId?: string;
}

interface PlayerMatchTransitionProps {
  onComplete: () => void;
  players?: PlayerData[];
}

const defaultPlayers: PlayerData[] = [
  { name: "You", level: 12, wins: 145, streak: 5 },
  { name: "Opponent", level: 10, wins: 120, streak: 2 },
];

const getPlayerIcon = (index: number) => {
  switch (index) {
    case 0: return <Shield className="w-4 h-4 text-accent-foreground" />;
    case 1: return <Trophy className="w-4 h-4 text-primary-foreground" />;
    case 2: return <Crown className="w-4 h-4 text-white" />;
    case 3: return <Star className="w-4 h-4 text-white" />;
    default: return <User className="w-4 h-4 text-white" />;
  }
};

const getColors = (index: number) => {
  switch (index) {
    case 0: return { bg: "from-primary to-primary/40", border: "border-primary", iconBg: "bg-accent" };
    case 1: return { bg: "from-secondary to-secondary/40", border: "border-secondary", iconBg: "bg-primary" };
    case 2: return { bg: "from-amber-500 to-amber-700/40", border: "border-amber-500", iconBg: "bg-amber-500" };
    case 3: return { bg: "from-emerald-500 to-emerald-700/40", border: "border-emerald-500", iconBg: "bg-emerald-500" };
    default: return { bg: "from-slate-500 to-slate-700/40", border: "border-slate-500", iconBg: "bg-slate-500" };
  }
};

const PlayerMatchTransition = ({ 
  onComplete, 
  players = defaultPlayers
}: PlayerMatchTransitionProps) => {
  useEffect(() => {
    sounds.success();
    const timer = setTimeout(() => {
      onComplete();
    }, 3500); // slightly longer for multi-player to read names
    return () => clearTimeout(timer);
  }, [onComplete]);

  const activePlayers = players.length >= 2 ? players : defaultPlayers;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-full h-full bg-primary/5 rounded-full blur-3xl"
        />
        <motion.div 
          animate={{ rotate: -360, scale: [1, 1.5, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-secondary/5 rounded-full blur-3xl"
        />
      </div>

      <motion.h2 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-xl font-display font-black text-foreground uppercase tracking-widest mb-12 relative z-10"
      >
        Match Found
      </motion.h2>

      <div className={`grid gap-6 w-full px-4 relative z-10 ${
        activePlayers.length === 2 ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center max-w-lg mx-auto" : 
        activePlayers.length === 3 ? "grid-cols-3" : 
        "grid-cols-2 md:grid-cols-4"
      }`}>
        
        {activePlayers.map((player, index) => {
          const colors = getColors(index);
          const isYou = player.name === "You";
          
          return (
            <div key={index} className="contents">
              {/* Insert VS marker between player 1 and 2 only if it's a 2 player game */}
              {activePlayers.length === 2 && index === 1 && (
                <div className="flex flex-col items-center justify-center -mx-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", delay: 0.4, stiffness: 200 }}
                    className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center font-display font-black text-xl italic shadow-xl z-20"
                  >
                    VS
                  </motion.div>
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: 100 }}
                    transition={{ delay: 0.6 }}
                    className="w-0.5 bg-gradient-to-b from-transparent via-border to-transparent my-2"
                  />
                </div>
              )}

              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", delay: 0.2 + (index * 0.1) }}
                className="flex flex-col items-center gap-4 bg-muted/20 p-4 rounded-3xl border border-border/50 backdrop-blur-sm min-w-0"
              >
                <div className="relative">
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }} 
                    transition={{ duration: 2, repeat: Infinity, delay: index * 0.2 }}
                    className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br ${colors.bg} p-0.5 shadow-lg shadow-black/10`}
                  >
                    <div className="w-full h-full rounded-2xl bg-background flex items-center justify-center overflow-hidden">
                      {player.avatar ? (
                        <img src={getFullUrl(player.avatar)} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground" />
                      )}
                    </div>
                  </motion.div>
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5 + (index * 0.1) }}
                    className={`absolute -bottom-2 ${index % 2 === 0 ? '-right-2' : '-left-2'} w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center border-2 border-background shadow-lg`}
                  >
                    {getPlayerIcon(index)}
                  </motion.div>
                </div>
                <div className="text-center w-full">
                  <h3 className={`text-lg font-display font-bold truncate ${isYou ? 'text-primary' : 'text-foreground'}`}>
                    {player.name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-semibold">Lvl {player.level}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full mt-2">
                  <div className="bg-background/50 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold">Wins</p>
                    <p className="text-sm font-display font-bold text-foreground">{player.wins}</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold">Streak</p>
                    <p className="text-sm font-display font-bold text-accent">{player.streak}🔥</p>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-16 flex items-center gap-2 text-primary font-display font-bold"
      >
        <Zap className="w-4 h-4 fill-primary" />
        <span className="animate-pulse">Starting Match...</span>
      </motion.div>
    </motion.div>
  );
};

export default PlayerMatchTransition;
