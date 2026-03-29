import { ChevronRight, Users, Ban } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { sounds } from "@/components/game/AnimationEffects";

interface GameCardProps {
  game: {
    id: string;
    name: string;
    players: string;
    activePlayers: number;
    emoji: string;
    gradient: string;
    path: string;
    comingSoon?: boolean;
    disabled?: boolean;
  };
}

const GameCard = ({ game }: GameCardProps) => {
  if (game.disabled) {
    return (
      <div className="block opacity-60 pointer-events-none">
        <div className="card-game rounded-2xl p-4 flex items-center gap-4 grayscale">
          <div className={`w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0`}>
            <span>{game.emoji}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-display font-bold text-foreground">{game.name}</h4>
            <div className="mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/10 border border-destructive/30 text-[10px] font-display font-bold uppercase tracking-wider text-destructive shadow-sm">
                <Ban className="w-3 h-3" /> Temporarily Unavailable
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link to={game.path} onClick={() => sounds.tap()} className="block">
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="card-game rounded-2xl p-4 flex items-center gap-4 group"
      >
        <motion.div
          className={`w-14 h-14 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center text-2xl shrink-0 relative`}
          whileHover={{ rotate: [0, -5, 5, 0] }}
          transition={{ duration: 0.4 }}
        >
          <motion.span
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {game.emoji}
          </motion.span>
        </motion.div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-display font-bold text-foreground">{game.name}</h4>
          {game.comingSoon ? (
            <div className="mt-1">
              <span className="inline-block px-2 py-0.5 rounded-md bg-muted border border-border text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground shadow-sm">
                Coming Soon
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">{game.players}</span>
              <div className="flex items-center gap-1 text-xs text-primary">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Users className="w-3 h-3" />
                </motion.div>
                <span>{game.activePlayers.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
        <motion.div
          className="shrink-0"
          animate={{ x: [0, 3, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </motion.div>
      </motion.div>
    </Link>
  );
};

export default GameCard;
