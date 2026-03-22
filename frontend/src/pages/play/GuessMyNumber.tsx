import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, ArrowUp, ArrowDown, Check, Sparkles, Timer, RotateCcw, Target } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import MatchLobby from "@/components/game/MatchLobby";
import { ConfettiExplosion, PageTransition, sounds, useScreenShake } from "@/components/game/AnimationEffects";
import ChatSystem from "@/components/game/ChatSystem";
import GameCountdown from "@/components/game/GameCountdown";
import PlayerMatchTransition from "@/components/game/PlayerMatchTransition";
import TurnTimerCountdown from "@/components/game/TurnTimerCountdown";
import { useMatchTimer } from "@/hooks/useMatchTimer";
import { getSocket } from "@/lib/socket";

type GameState = "lobby" | "matching" | "countdown" | "match-found" | "playing" | "result";

const GuessMyNumber = () => {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [stake, setStake] = useState(0);
  const [currentGuess, setCurrentGuess] = useState("");
  const [winner, setWinner] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const { shake, shakeClass } = useScreenShake();
  const [chatOpen, setChatOpen] = useState(false);
  const timer = useMatchTimer();
  const socketRef = useRef<any>(null);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [myGuess, setMyGuess] = useState<number | null>(null);
  const [opponentGuess, setOpponentGuess] = useState<number | null>(null);
  const [secretNumber, setSecretNumber] = useState<number | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(true);

  useEffect(() => {
    socketRef.current = getSocket();

    socketRef.current.on("matchFound", (match: any) => {
      setCurrentMatch(match);
      setGameState("match-found");
      sounds.matchFound?.();
    });

    socketRef.current.on("matchUpdate", (match: any) => {
      setCurrentMatch(match);
      if (match.status === "FINISHED") {
        setTurnDeadline(null);
        const userId = localStorage.getItem("userId");
        const myMove = (match.moves || []).find((m: any) => m.userId === userId);
        const opMove = (match.moves || []).find((m: any) => m.userId !== userId);

        if (myMove) {
          const parts = myMove.move.split(",");
          setMyGuess(Number(parts[0].replace("guess:", "")));
          setSecretNumber(Number(parts[1].replace("secret:", "")));
        }
        if (opMove) {
          setOpponentGuess(Number(opMove.move.split(",")[0].replace("guess:", "")));
        }

        setWinner(match.winnerId === userId ? "You" : match.winnerId === null ? "Draw" : "Opponent");
        setGameState("result");
        timer.stop();
        if (match.winnerId === userId) {
          setShowConfetti(true);
          sounds.win();
          setTimeout(() => setShowConfetti(false), 4000);
        } else {
          sounds.fail();
        }
      }
    });

    socketRef.current.on("waitingForOpponent", () => {
      setGameState("matching");
    });

    socketRef.current.on("startTurnTimer", (data: any) => {
      setTurnDeadline(Date.now() + data.turnTimeMs);
    });

    socketRef.current.on("opponentMoved", () => {});

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleStartMatchmaking = () => {
    sounds.select();
    setGameState("matching");
    socketRef.current?.emit("joinMatch", { gameType: "GUESS", stake });
  };

  const handleCancelMatchmaking = () => {
    sounds.tap();
    socketRef.current?.emit("leaveQueue");
    setGameState("lobby");
  };

  const handleCountdownComplete = useCallback(() => {
    setGameState("match-found");
  }, []);

  const handleMatchTransitionComplete = useCallback(() => {
    setGameState("playing");
    timer.start();
  }, [timer]);

  const submitGuess = () => {
    const n = parseInt(currentGuess);
    if (isNaN(n) || n < 1 || n > 100) return;
    sounds.tap();
    setMyGuess(n);
    setIsMyTurn(false);
    socketRef.current?.emit("submitMove", { matchId: currentMatch.id, move: `guess:${n}` });
  };

  const [showExitDialog, setShowExitDialog] = useState(false);

  const handleExitClick = () => {
    if (gameState === "playing") {
      setShowExitDialog(true);
    } else {
      resetGame();
    }
  };

  const confirmExit = () => {
    if (currentMatch?.id) {
      socketRef.current?.emit("forfeitMatch", { matchId: currentMatch.id });
    }
    setShowExitDialog(false);
  };

  const resetGame = () => {
    setMyGuess(null);
    setOpponentGuess(null);
    setWinner(null);
    setSecretNumber(null);
    setTurnDeadline(null);
    setIsMyTurn(true);
    setShowExitDialog(false);
    setGameState("lobby");
    timer.reset();
  };

  const sendRematch = () => {
    sounds.success();
    resetGame();
    setStake(0);
    setGameState("lobby");
  };

  if (gameState === "lobby") {
    return <MatchLobby gameName="Guess My Number" emoji="🔢" players="1v1" onStart={handleStartMatchmaking} stake={stake} onStakeChange={setStake} gameType="GUESS" socketRef={socketRef} />;
  }

  if (gameState === "matching") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center">
        <button
          onClick={handleCancelMatchmaking}
          className="absolute top-6 left-6 w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors z-50"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity }} className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mb-6">
          <span className="text-5xl">🔢</span>
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Finding Opponent</h2>
        <p className="text-muted-foreground text-sm max-w-[200px] mb-8">Searching for a player with a ${stake} stake...</p>
        <motion.div animate={{ x: [-20, 20, -20] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="h-1 w-32 bg-muted rounded-full overflow-hidden mb-8">
          <div className="h-full w-1/3 bg-primary rounded-full" />
        </motion.div>
        <button
          onClick={handleCancelMatchmaking}
          className="px-6 py-3 rounded-xl font-display font-bold text-sm bg-muted text-muted-foreground transition-all active:scale-95 hover:bg-muted/80"
        >
          Cancel Matchmaking
        </button>
      </div>
    );
  }

  if (gameState === "result") {
    const isWinner = winner === "You";
    const isDraw = winner === "Draw";
    const opParticipant = currentMatch?.participants?.find((p: any) => p.userId !== localStorage.getItem("userId"));

    return (
      <PageTransition>
        <ConfettiExplosion active={showConfetti} />
        <div className="px-4 pt-6 min-h-screen flex flex-col">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 mb-6">
            <motion.button whileTap={{ scale: 0.85 }} onClick={handleExitClick} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
            </motion.button>
            <h1 className="text-lg font-display font-bold text-foreground">Results</h1>
          </motion.div>

          {/* Secret Reveal */}
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center justify-center mb-8">
            <p className="text-xs text-muted-foreground font-display font-bold uppercase tracking-widest mb-2">The Secret Number Was</p>
            <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center relative border-4 border-primary/50 shadow-[0_0_40px_rgba(var(--primary-rgb),0.3)]">
               <span className="text-5xl font-display font-extrabold text-primary">{secretNumber}</span>
               <Sparkles className="absolute -top-2 -right-2 text-primary w-8 h-8" />
            </div>
          </motion.div>

          <motion.div initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} className="text-center mb-6 p-6 card-game rounded-2xl relative overflow-hidden">
            <motion.div className="absolute inset-0" style={{ background: isWinner ? "linear-gradient(135deg, hsl(145 100% 45% / 0.1), transparent)" : isDraw ? "transparent" : "linear-gradient(135deg, hsl(0 84% 60% / 0.1), transparent)" }} />
            <div className="relative z-10">
              <motion.p className={`text-2xl font-display font-extrabold ${isWinner ? "text-primary" : isDraw ? "text-foreground" : "text-destructive"}`}>
                {isWinner ? "YOU WON! 🎉" : isDraw ? "IT'S A DRAW! 🤝" : "OPPONENT WON! 💀"}
              </motion.p>
              <p className="text-sm text-muted-foreground mt-1">{isWinner ? `Won $${stake * 2}!` : isDraw ? "Stake refunded!" : `Lost $${stake}`}</p>
            </div>
          </motion.div>

          <div className="space-y-3 mb-8">
            <div className="card-game rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Your Guess</p>
                <p className="text-xl font-display font-bold">{myGuess}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Difference</p>
                <p className="text-xl font-display font-bold text-primary">±{Math.abs((myGuess || 0) - (secretNumber || 0))}</p>
              </div>
            </div>
            <div className="card-game rounded-xl p-4 flex items-center justify-between italic">
              <div>
                <p className="text-xs text-muted-foreground">{opParticipant?.user?.username || "Opponent"}'s Guess</p>
                <p className="text-xl font-display font-bold">{opponentGuess}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Difference</p>
                <p className="text-xl font-display font-bold text-muted-foreground">±{Math.abs((opponentGuess || 0) - (secretNumber || 0))}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pb-8 mt-auto">
            <motion.button whileTap={{ scale: 0.95 }} onClick={sendRematch} className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> Online Play
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={resetGame} className="py-4 px-6 rounded-2xl bg-muted text-foreground font-display font-bold text-sm border border-border">
              Exit
            </motion.button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <AnimatePresence>
        {showExitDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center px-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-background rounded-2xl p-6 max-w-sm w-full border border-border shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                  <ArrowLeft className="w-5 h-5 text-destructive" />
                </div>
                <h3 className="text-lg font-display font-bold text-foreground">Leave Match?</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Leaving during a match will count as a <span className="text-destructive font-bold">loss</span>. 
                Your stake of <span className="font-bold text-foreground">${stake}</span> will be forfeited.
              </p>
              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowExitDialog(false)}
                  className="flex-1 py-3 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border"
                >
                  Stay
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={confirmExit}
                  className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-display font-bold text-sm"
                >
                  Leave & Forfeit
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(gameState === "countdown" ) && <GameCountdown onComplete={handleCountdownComplete} />}
      </AnimatePresence>
      <AnimatePresence>
        {gameState === "match-found" && <PlayerMatchTransition onComplete={handleMatchTransitionComplete} />}
      </AnimatePresence>

      <div className={`px-4 pt-6 min-h-screen flex flex-col ${shakeClass}`}>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.85 }} onClick={handleExitClick} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
            </motion.button>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">Guess My Number</h1>
              <p className="text-xs text-primary font-display font-semibold">${stake} stake • 1-100</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-display font-semibold text-muted-foreground">
              <Timer className="w-3 h-3" />{timer.formatted}
            </div>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setChatOpen(true)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center relative">
              <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
            </motion.button>
          </div>
        </motion.div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
           <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity }} className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center border-2 border-primary/20">
              <Target className="w-12 h-12 text-primary" />
           </motion.div>
           <div className="text-center">
              <h2 className="text-2xl font-display font-bold mb-2">Enter Your Guess</h2>
              <p className="text-sm text-muted-foreground">Which number is closest to the server's secret?</p>
           </div>

           <input
             type="number"
             min={1}
             max={100}
             value={currentGuess}
             autoFocus
             onChange={(e) => setCurrentGuess(e.target.value)}
             onKeyDown={(e) => e.key === "Enter" && submitGuess()}
             className="w-48 h-20 text-center text-4xl font-display font-extrabold bg-muted rounded-3xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all"
             placeholder="1-100"
           />

           {myGuess && (
             <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-primary font-display font-bold animate-pulse">
               Guess submitted! Waiting for opponent...
             </motion.p>
           )}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pb-12">
           <motion.button
             whileTap={{ scale: 0.95 }}
             onClick={submitGuess}
             disabled={!currentGuess || myGuess !== null}
             className="w-full py-5 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-xl glow-primary disabled:opacity-50"
           >
             Submit Final Guess
           </motion.button>
        </motion.div>
      </div>

      <TurnTimerCountdown deadline={turnDeadline} isMyTurn={isMyTurn} />

      <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["global", "game"]} currentChannel="game" />
    </PageTransition>
  );
};

export default GuessMyNumber;
