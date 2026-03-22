import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, Users, Dices, RotateCcw, Check, Timer } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import MatchLobby from "@/components/game/MatchLobby";
import { ConfettiExplosion, PageTransition, AnimatedCounter, sounds, useScreenShake } from "@/components/game/AnimationEffects";
import ChatSystem from "@/components/game/ChatSystem";
import PlayerProfileSheet from "@/components/game/PlayerProfileSheet";
import GameCountdown from "@/components/game/GameCountdown";
import PlayerMatchTransition from "@/components/game/PlayerMatchTransition";
import TurnTimerCountdown from "@/components/game/TurnTimerCountdown";
import { useMatchTimer } from "@/hooks/useMatchTimer";
import { getSocket } from "@/lib/socket";

type GameState = "lobby" | "matching" | "countdown" | "match-found" | "playing" | "result";

const rollDice = (): [number, number] => [
  Math.floor(Math.random() * 6) + 1,
  Math.floor(Math.random() * 6) + 1,
];

const DICE_DOTS: Record<number, number[][]> = {
  1: [[1,1]],
  2: [[0,0],[2,2]],
  3: [[0,0],[1,1],[2,2]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],
};

const DiceFace = ({ value, rolling, landed }: { value: number; rolling: boolean; landed: boolean }) => (
  <motion.div
    animate={rolling ? { rotateX: [0, 360, 720, 1080], rotateY: [0, 180, 360, 540], scale: [1, 1.1, 0.95, 1.05, 1] } : landed ? { scale: [1.2, 0.9, 1.05, 1], rotate: [8, -4, 2, 0] } : {}}
    transition={rolling ? { duration: 0.8, ease: "easeOut" } : { duration: 0.4, ease: "easeOut" }}
    className={`w-20 h-20 rounded-2xl flex items-center justify-center relative ${rolling ? "dice-face rolling" : landed ? "dice-face landed" : "dice-face"}`}
    style={{ background: rolling ? undefined : "var(--gradient-card)", boxShadow: landed && value > 4 ? "0 0 20px hsl(145 100% 45% / 0.3), 0 4px 12px rgba(0,0,0,0.4)" : landed && value <= 4 ? "0 0 20px hsl(0 84% 60% / 0.3), 0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.4)" }}
  >
    {value > 0 && !rolling ? (
      <div className="grid grid-rows-3 grid-cols-3 gap-0.5 w-12 h-12">
        {Array.from({ length: 9 }, (_, idx) => {
          const row = Math.floor(idx / 3);
          const col = idx % 3;
          const hasDot = DICE_DOTS[value]?.some(([r, c]) => r === row && c === col);
          return (
            <div key={idx} className="flex items-center justify-center">
              {hasDot && <motion.div initial={landed ? { scale: 0 } : false} animate={{ scale: 1 }} transition={{ delay: landed ? idx * 0.03 : 0, type: "spring", stiffness: 400 }} className="w-2.5 h-2.5 rounded-full bg-foreground" />}
            </div>
          );
        })}
      </div>
    ) : (
      <motion.span className="text-3xl" animate={rolling ? { opacity: [1, 0.5, 1] } : {}} transition={{ duration: 0.2, repeat: rolling ? Infinity : 0 }}>🎲</motion.span>
    )}
  </motion.div>
);

const DiceBattle = () => {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [stake, setStake] = useState(0);
  const [playerDice, setPlayerDice] = useState<[number, number]>([0, 0]);
  const [rollCount, setRollCount] = useState(0);
  const [turnScore, setTurnScore] = useState(0);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const { shake, shakeClass } = useScreenShake();
  const [chatOpen, setChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePlayer, setProfilePlayer] = useState<string | null>(null);
  const timer = useMatchTimer();

  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const matchRef = useRef<any>(null);
  const [opponentRoll, setOpponentRoll] = useState<[number, number] | null>(null);

  const socketRef = useRef<any>(null);

  useEffect(() => {
    socketRef.current = getSocket();

    socketRef.current.on("matchFound", (match: any) => {
      setCurrentMatch(match);
      matchRef.current = match;
      setGameState("match-found");
      sounds.matchFound?.();
    });

    socketRef.current.on("matchUpdate", (match: any) => {
      setCurrentMatch(match);
      matchRef.current = match;

      if (match.status === "FINISHED") {
        setTurnDeadline(null);
        const userId = localStorage.getItem("userId");
        const myMove = (match.moves || []).find((m: any) => m.userId === userId);
        const opMove = (match.moves || []).find((m: any) => m.userId !== userId);
        
        if (opMove) {
          const rolls = opMove.move.replace("roll:", "").split(",").map(Number);
          setOpponentRoll([rolls[0] || 1, rolls[1] || 1]);
        }

        if (myMove) {
          const rolls = myMove.move.replace("roll:", "").split(",").map(Number);
          setPlayerDice([rolls[0] || 1, rolls[1] || 1]);
          setTurnScore((rolls[0] || 0) + (rolls[1] || 0));
        }

        setWinner(match.winnerId === userId ? "You" : match.winnerId === null ? "Draw" : "Opponent");
        setGameState("result");
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

    socketRef.current.on("opponentMoved", () => {
      // Could show a "they rolled" status instead of waiting
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleStartMatchmaking = () => {
    sounds.select();
    setGameState("matching");
    socketRef.current?.emit("joinMatch", { gameType: "DICE", stake });
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

  const doRoll = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    setLanded(false);
    setIsMyTurn(false);
    sounds.roll();

    const flashInterval = setInterval(() => {
      setPlayerDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    }, 80);

    setTimeout(() => {
      clearInterval(flashInterval);
      setRolling(false);
      setLanded(true);
      setRollCount(1);
      sounds.select();
      
      socketRef.current?.emit("submitMove", { matchId: currentMatch.id, move: "roll" });
    }, 1200);
  }, [rolling, currentMatch]);

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
    setPlayerDice([0, 0]);
    setRollCount(0);
    setTurnScore(0);
    setRolling(false);
    setLanded(false);
    setWinner(null);
    setShowConfetti(false);
    setTurnDeadline(null);
    setIsMyTurn(true);
    setShowExitDialog(false);
    timer.reset();
    setGameState("lobby");
  };

  const sendRematch = () => {
    sounds.success();
    resetGame();
    setStake(0);
    setGameState("lobby");
  };

  const handleViewProfile = (name: string) => {
    setProfilePlayer(name);
    setProfileOpen(true);
  };

  if (gameState === "lobby") {
    return <MatchLobby gameName="Dice Battle" emoji="🎲" players="2 Players" onStart={handleStartMatchmaking} stake={stake} onStakeChange={setStake} gameType="DICE" socketRef={socketRef} />;
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
        <motion.div
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mb-6"
        >
          <span className="text-5xl">🎲</span>
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Finding Players</h2>
        <p className="text-muted-foreground text-sm max-w-[200px] mb-8">
          Searching for a Dice Battle with a ${stake} stake...
        </p>
        <motion.div
          animate={{ x: [-20, 20, -20] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="h-1 w-32 bg-muted rounded-full overflow-hidden mb-8"
        >
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
    const userId = localStorage.getItem("userId");
    const myMatchMove = currentMatch?.moves?.find((m: any) => m.userId === userId);
    const opMatchMove = currentMatch?.moves?.find((m: any) => m.userId !== userId);
    const opParticipant = currentMatch?.participants?.find((p: any) => p.userId !== userId);

    const parseMove = (m: string) => {
      if (!m) return { sum: 0, text: "0+0" };
      const val = m.replace("roll:", "");
      if (val.includes(",")) {
        const parts = val.split(",").map(Number);
        return { sum: (parts[0] || 0) + (parts[1] || 0), text: `${parts[0]}+${parts[1]}` };
      }
      return { sum: Number(val), text: `${val}+0` };
    };

    const myRes = parseMove(myMatchMove?.move);
    const opRes = parseMove(opMatchMove?.move);

    const allScores = [
      { name: "You", score: myRes.sum, rolls: myRes.text, isMe: true },
      { name: opParticipant?.user?.username || "Opponent", score: opRes.sum, rolls: opRes.text, isMe: false }
    ].sort((a, b) => b.score - a.score);

    const isWinner = currentMatch?.winnerId === userId;
    const isDraw = currentMatch?.winnerId === null && currentMatch?.status === "FINISHED";

    return (
      <PageTransition>
        <ConfettiExplosion active={showConfetti} />
        <div className="px-4 pt-6 min-h-screen flex flex-col">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 mb-6">
            <motion.button whileTap={{ scale: 0.85 }} onClick={resetGame} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
            </motion.button>
            <h1 className="text-lg font-display font-bold text-foreground">Results</h1>
          </motion.div>

          <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 15 }} className="text-center mb-6 p-6 card-game rounded-2xl relative overflow-hidden">
            <motion.div className="absolute inset-0" style={{ background: isWinner ? "linear-gradient(135deg, hsl(145 100% 45% / 0.08), hsl(51 100% 50% / 0.08))" : isDraw ? "transparent" : "linear-gradient(135deg, hsl(0 84% 60% / 0.08), transparent)" }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
            <div className="relative z-10">
              <motion.p className="text-4xl mb-2" animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: 2 }}>🎲</motion.p>
              <motion.p className={`text-2xl font-display font-extrabold ${isWinner ? "text-primary" : isDraw ? "text-foreground" : "text-destructive"}`} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                {isWinner ? "YOU WIN! 🎉" : isDraw ? "IT'S A DRAW! 🤝" : "YOU LOST! 💀"}
              </motion.p>
              <p className="text-sm text-muted-foreground mt-1">
                {isWinner ? `Won $${stake * 2}!` : isDraw ? "Stake refunded!" : `Lost $${stake}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Timer className="w-3 h-3" /> Match duration: {timer.formatted}
              </p>
            </div>
          </motion.div>

          <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2">Match History</p>
          <div className="space-y-2 mb-6">
            {allScores.map((s, i) => (
              <motion.div key={s.name + i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }} className={`card-game rounded-xl p-3 flex items-center gap-3 ${s.isMe && isWinner ? "ring-2 ring-primary" : ""}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-display font-extrabold text-sm ${i === 0 && !isDraw ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  #{i + 1}
                </span>
                <span className="flex-1 font-display font-semibold text-sm text-foreground">{s.name}</span>
                <div className="text-right">
                  <span className="font-display font-bold text-sm text-primary">{s.score} pts</span>
                  <p className="text-[10px] text-muted-foreground">[{s.rolls}]</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex gap-3">
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
        {gameState === "countdown" && <GameCountdown onComplete={handleCountdownComplete} />}
      </AnimatePresence>

      <AnimatePresence>
        {gameState === "match-found" && (
          <PlayerMatchTransition onComplete={handleMatchTransitionComplete} />
        )}
      </AnimatePresence>

      <div className={`px-4 pt-6 min-h-screen flex flex-col ${shakeClass}`}>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.85 }} onClick={handleExitClick} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
            </motion.button>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">Dice Battle</h1>
              <p className="text-xs text-primary font-display font-semibold">${stake} stake</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-display font-semibold text-muted-foreground">
              <Timer className="w-3 h-3" />{timer.formatted}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>{currentMatch?.participants?.length || 2}</span>
            </div>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setChatOpen(true)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center relative">
              <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
            </motion.button>
          </div>
        </motion.div>

        {/* Roll info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-3 mb-6">
          <div className="flex-1 card-game rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground font-display">Rolls</p>
            <p className="text-xl font-display font-extrabold text-foreground">{rollCount}/1</p>
          </div>
          <div className="flex-1 card-game rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground font-display">Score</p>
            <p className="text-xl font-display font-extrabold text-primary"><AnimatedCounter value={turnScore} /></p>
          </div>
        </motion.div>

        {/* Dice */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <motion.div className="flex gap-6" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <DiceFace value={playerDice[0]} rolling={rolling} landed={landed} />
            <DiceFace value={playerDice[1]} rolling={rolling} landed={landed} />
          </motion.div>

          <AnimatePresence mode="wait">
            {playerDice[0] > 0 && !rolling && (
              <motion.p key="sum" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-muted-foreground font-display">
                {playerDice[0]} + {playerDice[1]} = <motion.span className="text-foreground font-bold text-base" initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{playerDice[0] + playerDice[1]}</motion.span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="pb-24 space-y-3">
          <AnimatePresence mode="wait">
            {rollCount === 0 && !rolling && (
              <motion.button key="first-roll" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} whileTap={{ scale: 0.95 }} onClick={doRoll} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary flex items-center justify-center gap-2">
                <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 1, repeat: Infinity }}>
                  <Dices className="w-5 h-5" />
                </motion.div>
                Roll Dice
              </motion.button>
            )}

            {(rolling || (rollCount === 1 && gameState === "playing")) && (
              <motion.div key="rolling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full py-4 rounded-2xl bg-muted text-center">
                <motion.p className="font-display font-bold text-muted-foreground" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.5, repeat: Infinity }}>
                  {rolling ? "Rolling..." : "Waiting for opponent..."}
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <TurnTimerCountdown deadline={turnDeadline} isMyTurn={isMyTurn} />

      <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["global", "room", "game"]} currentChannel="game" />
      <PlayerProfileSheet isOpen={profileOpen} onClose={() => setProfileOpen(false)} playerName={profilePlayer} />
    </PageTransition>
  );
};

export default DiceBattle;
