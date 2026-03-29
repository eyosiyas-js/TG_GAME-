import { motion } from "framer-motion";
import { ArrowLeft, Pickaxe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageTransition } from "@/components/game/AnimationEffects";

const GuessMyNumber = () => {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center">
        <button
          onClick={() => navigate("/")}
          className="absolute top-6 left-6 w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors z-50"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity }} className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mb-6">
          <Pickaxe className="w-12 h-12 text-primary" />
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Coming Soon</h2>
        <p className="text-muted-foreground text-sm max-w-[200px] mb-8">We are actively building the Guess My Number game. Check back later!</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-xl font-display font-bold text-sm bg-muted text-foreground transition-all active:scale-95 hover:bg-muted/80 border border-border"
        >
          Return Home
        </button>
      </div>
    </PageTransition>
  );
};

export default GuessMyNumber;
