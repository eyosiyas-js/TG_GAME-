import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { sounds } from "@/components/game/AnimationEffects";

interface GameCountdownProps {
  onComplete: () => void;
  seconds?: number;
}

const GameCountdown = ({ onComplete, seconds = 5 }: GameCountdownProps) => {
  const [count, setCount] = useState(seconds);

  useEffect(() => {
    if (count <= 0) {
      sounds.success();
      onComplete();
      return;
    }
    sounds.tap();
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
    >
      <motion.p className="text-sm text-muted-foreground font-display font-semibold">
        Game starting in...
      </motion.p>
      <AnimatePresence mode="wait">
        <motion.span
          key={count}
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="text-7xl font-display font-extrabold text-primary"
        >
          {count}
        </motion.span>
      </AnimatePresence>
      <motion.div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: seconds, ease: "linear" }}
        />
      </motion.div>
    </motion.div>
  );
};

export default GameCountdown;
