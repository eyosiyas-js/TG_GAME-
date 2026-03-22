import { motion } from "framer-motion";
import { useState } from "react";
import { sounds } from "@/components/game/AnimationEffects";

interface StakeChipProps {
  amount: number;
}

const StakeChip = ({ amount }: StakeChipProps) => {
  const [selected, setSelected] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      onClick={() => {
        setSelected(!selected);
        sounds.select();
      }}
      animate={selected ? { boxShadow: ["0 0 10px hsl(145 100% 45% / 0.3)", "0 0 24px hsl(145 100% 45% / 0.5)", "0 0 10px hsl(145 100% 45% / 0.3)"] } : {}}
      transition={selected ? { duration: 1.5, repeat: Infinity } : { duration: 0.2 }}
      className={`shrink-0 px-5 py-2.5 rounded-xl font-display font-bold text-sm transition-colors ${
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground border border-border hover:border-primary/50"
      }`}
    >
      ${amount}
    </motion.button>
  );
};

export default StakeChip;
