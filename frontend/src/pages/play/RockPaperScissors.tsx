import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, Timer, RotateCcw, CheckCircle2, AlertTriangle, WifiOff } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import MatchLobby from "@/components/game/MatchLobby";
import { ConfettiExplosion, PageTransition, sounds, useScreenShake } from "@/components/game/AnimationEffects";
import ChatSystem from "@/components/game/ChatSystem";
import GameCountdown from "@/components/game/GameCountdown";
import PlayerMatchTransition from "@/components/game/PlayerMatchTransition";
import TurnTimerCountdown from "@/components/game/TurnTimerCountdown";
import { useMatchTimer } from "@/hooks/useMatchTimer";
import { getSocket } from "@/lib/socket";

type Choice = "rock" | "paper" | "scissors" | null;
type GameState = "lobby" | "matching" | "countdown" | "match-found" | "playing" | "reveal" | "result";

const choices = [
  { id: "rock" as const, emoji: "✊", label: "Rock" },
  { id: "paper" as const, emoji: "✋", label: "Paper" },
  { id: "scissors" as const, emoji: "✌️", label: "Scissors" },
];

const RockPaperScissors = () => {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [playerChoice, setPlayerChoice] = useState<Choice>(null);
  const [opponentChoice, setOpponentChoice] = useState<Choice>(null);
  const [opponentHasMoved, setOpponentHasMoved] = useState(false);
  const [result, setResult] = useState<"win" | "lose" | "draw" | null>(null);
  const [stake, setStake] = useState(0);
  const [revealCountdown, setRevealCountdown] = useState(3);
  const [showConfetti, setShowConfetti] = useState(false);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [winAmount, setWinAmount] = useState<number | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const { shake, shakeClass } = useScreenShake();
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const timer = useMatchTimer();
  const socketRef = useRef<any>(null);
  const queryClient = useQueryClient();

  // Match info from server
  const [matchId, setMatchId] = useState<string | null>(null);
  const [myName, setMyName] = useState("You");
  const [opponentName, setOpponentName] = useState("Opponent");
  const [opponentLevel, setOpponentLevel] = useState(1);

  // Exit confirmation dialog
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Opponent disconnect state
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState(60);
  const disconnectTimerRef = useRef<any>(null);
  const [resultReason, setResultReason] = useState<string | null>(null);

  // Check if we arrived via a rejoin navigation (from homepage banner)
  const location = useLocation();
  const rejoinData = (location.state as any)?.rejoin;

  useEffect(() => {
    socketRef.current = getSocket();

    // If we got here via rejoin navigation, skip lobby immediately
    if (rejoinData) {
      setMatchId(rejoinData.matchId);
      setOpponentName(rejoinData.opponentName || "Opponent");
      setOpponentLevel(rejoinData.opponentLevel || 1);
      setStake(rejoinData.stake || 200);
      setGameState("playing");
      timer.start();
    }

    socketRef.current.on("matchFound", (data: any) => {
      setMatchId(data.matchId);
      setMyName(data.yourName || "You");
      setOpponentName(data.opponentName || "Opponent");
      setOpponentLevel(data.opponentLevel || 1);
      setStake(data.stake || 200);
      setGameState("match-found");
      sounds.matchFound?.();
    });

    socketRef.current.on("matchUpdate", (data: any) => {
      if (data.status === "FINISHED") {
        // Clear any disconnect overlay
        setOpponentDisconnected(false);
        if (disconnectTimerRef.current) {
          clearInterval(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setTurnDeadline(null);

        const serverResult = data.result as "win" | "lose" | "draw";
        const serverYourMove = data.yourMove as Choice;
        const serverOpponentMove = data.opponentMove as Choice;
        const serverOpponentName = data.opponentName;
        const reason = data.reason || null;

        if (serverOpponentName) setOpponentName(serverOpponentName);
        setResultReason(reason);

        // If game ended due to forfeit/disconnect, skip reveal animation
        if (reason === 'opponent_forfeit' || reason === 'opponent_timeout' || reason === 'opponent_disconnected' || reason === 'forfeit') {
          timer.stop();
          setPlayerChoice(serverYourMove);
          setOpponentChoice(serverOpponentMove);
          setResult(serverResult);
          setWinAmount(data.winAmount || null);
          setGameState("result");

          // Clear the active-match cache so homepage banner disappears
          queryClient.setQueryData(["active-match"], null);

          if (serverResult === "win") {
            sounds.win();
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
          } else if (serverResult === "lose") {
            sounds.fail();
            shake();
          }
          return;
        }

        // Normal game end — do reveal countdown
        setPlayerChoice(serverYourMove);
        setOpponentChoice(null);

        let count = 3;
        setRevealCountdown(count);
        setGameState("reveal");

        const interval = setInterval(() => {
          count--;
          setRevealCountdown(count);
          sounds.tap();
          if (count <= 0) {
            clearInterval(interval);
            timer.stop();
            setOpponentChoice(serverOpponentMove);
            setResult(serverResult);
            setWinAmount(data.winAmount || null);
            setGameState("result");

            // Clear the active-match cache so homepage banner disappears
            queryClient.setQueryData(["active-match"], null);

            if (serverResult === "win") {
              sounds.win();
              setShowConfetti(true);
              setTimeout(() => setShowConfetti(false), 3000);
            } else if (serverResult === "lose") {
              sounds.fail();
              shake();
            } else {
              sounds.select();
            }
          }
        }, 600);
      }
    });

    socketRef.current.on("opponentMoved", () => {
      setOpponentHasMoved(true);
    });

    socketRef.current.on("startTurnTimer", (data: any) => {
      setTurnDeadline(data.remainingMs ?? null);
    });

    socketRef.current.on("moveAccepted", () => {});

    socketRef.current.on("waitingForOpponent", () => {
      setGameState("matching");
    });

    // Opponent disconnected — show countdown overlay
    socketRef.current.on("opponentDisconnected", (data: any) => {
      setOpponentDisconnected(true);
      const deadline = data.reconnectDeadline;
      const updateCountdown = () => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setDisconnectCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
      };
      updateCountdown();
      disconnectTimerRef.current = setInterval(updateCountdown, 1000);
    });

    // Opponent reconnected — dismiss overlay
    socketRef.current.on("opponentReconnected", () => {
      setOpponentDisconnected(false);
      if (disconnectTimerRef.current) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    });

    // timerFrozen: emitted to ALL players when someone disconnects.
    // Freeze the turn timer display so no one sees a running clock while game is paused.
    socketRef.current.on("timerFrozen", () => {
      setTurnDeadline(null);
    });

    // Dual-disconnect: this player rejoined but the opponent is still gone.
    // Show the waiting overlay rather than resuming the game.
    socketRef.current.on("opponentStillDisconnected", (data: any) => {
      setOpponentDisconnected(true);
      setTurnDeadline(null);
      const deadline = data.reconnectDeadline;
      if (deadline) {
        const updateCountdown = () => {
          const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          setDisconnectCountdown(remaining);
        };
        updateCountdown();
        disconnectTimerRef.current = setInterval(updateCountdown, 1000);
      }
    });

    // Rejoin: server tells us we have an active match after socket reconnects
    socketRef.current.on("rejoinedMatch", (data: any) => {
      setMatchId(data.matchId);
      setOpponentName(data.opponentName || "Opponent");
      setOpponentLevel(data.opponentLevel || 1);
      setStake(data.stake || 200);
      if (gameState === "lobby" || gameState === "matching") {
        setGameState("playing");
        // Restore elapsed timer from server-provided match start time
        if (data.matchStartedAt) {
          timer.startFrom(data.matchStartedAt);
        } else {
          timer.start();
        }
      }
    });

    return () => {
      if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  const handleStartMatchmaking = () => {
    sounds.select();
    setGameState("matching");
    socketRef.current?.emit("joinMatch", { gameType: "RPS", stake });
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

  const play = (choice: Choice) => {
    if (playerChoice) return;
    if (!matchId) return;
    sounds.select();
    setPlayerChoice(choice);
    setIsMyTurn(false);
    socketRef.current?.emit("submitMove", { matchId, move: choice });
  };

  const fullReset = () => {
    setPlayerChoice(null);
    setOpponentChoice(null);
    setOpponentHasMoved(false);
    setResult(null);
    setShowConfetti(false);
    setMatchId(null);
    setOpponentName("Opponent");
    setOpponentLevel(1);
    setShowExitDialog(false);
    setOpponentDisconnected(false);
    setResultReason(null);
    setTurnDeadline(null);
    setIsMyTurn(true);
    if (disconnectTimerRef.current) {
      clearInterval(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    timer.reset();
    setGameState("lobby");
  };

  // Exit button during match — show confirmation
  const handleExitClick = () => {
    if (gameState === "playing" || gameState === "reveal") {
      setShowExitDialog(true);
    } else {
      fullReset();
    }
  };

  // Confirm exit — forfeit
  const confirmExit = () => {
    if (matchId) {
      socketRef.current?.emit("forfeitMatch", { matchId });
    }
    setShowExitDialog(false);
    // Don't reset immediately — wait for matchUpdate with forfeit result
  };

  const sendRematch = () => {
    sounds.success();
    setPlayerChoice(null);
    setOpponentChoice(null);
    setOpponentHasMoved(false);
    setResult(null);
    setShowConfetti(false);
    setMatchId(null);
    setResultReason(null);
    setTurnDeadline(null);
    setIsMyTurn(true);
    setStake(0); // Reset stake for rematch requiring re-selection
    timer.reset();
    setGameState("lobby");
  };

  if (gameState === "lobby") {
    return (
      <MatchLobby gameName="Rock Paper Scissors" emoji="✊" players="1v1" onStart={handleStartMatchmaking} stake={stake} onStakeChange={setStake} gameType="RPS" socketRef={socketRef} />
    );
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
          <span className="text-5xl">✊</span>
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Finding Opponent</h2>
        <p className="text-muted-foreground text-sm max-w-[200px] mb-8">
          Searching for a player with a ${stake} stake...
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

  const resultReasonText = resultReason === 'opponent_forfeit' ? 'Opponent forfeited!'
    : resultReason === 'opponent_timeout' ? 'Opponent timed out!'
    : resultReason === 'forfeit' ? 'You forfeited'
    : null;

  return (
    <PageTransition>
      <ConfettiExplosion active={showConfetti} />

      {/* Exit Confirmation Dialog */}
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
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <h3 className="text-lg font-display font-bold text-foreground">Leave Match?</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Leaving during a match will count as a <span className="text-destructive font-bold">loss</span>. 
                Your stake of <span className="font-bold text-foreground">${stake}</span> will be forfeited to your opponent.
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

      {/* Opponent Disconnected Overlay */}
      <AnimatePresence>
        {opponentDisconnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-center justify-center px-6"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-background rounded-2xl p-6 max-w-sm w-full border border-border shadow-2xl text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4"
              >
                <WifiOff className="w-8 h-8 text-amber-500" />
              </motion.div>
              <h3 className="text-lg font-display font-bold text-foreground mb-2">Opponent Disconnected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                <span className="font-bold text-foreground">{opponentName}</span> has disconnected. 
                Waiting for them to reconnect...
              </p>
              <div className="relative w-full h-2 rounded-full bg-muted mb-3 overflow-hidden">
                <motion.div
                  className="h-full bg-amber-500 rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: `${(disconnectCountdown / 60) * 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </div>
              <p className="text-2xl font-display font-extrabold text-amber-500">{disconnectCountdown}s</p>
              <p className="text-xs text-muted-foreground mt-1">You win automatically when the timer expires</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState === "countdown" && <GameCountdown onComplete={handleCountdownComplete} />}
      </AnimatePresence>

      <AnimatePresence>
        {gameState === "match-found" && (
          <PlayerMatchTransition
            onComplete={handleMatchTransitionComplete}
            players={[
              { name: myName, level: 1, wins: 0, streak: 0 },
              { name: opponentName, level: opponentLevel, wins: 0, streak: 0 },
            ]}
          />
        )}
      </AnimatePresence>

      <div className={`px-4 pt-6 min-h-screen flex flex-col ${shakeClass}`}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.85 }} onClick={handleExitClick} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
            </motion.button>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">RPS</h1>
              <p className="text-xs text-primary font-display font-semibold">${stake} stake</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-display font-semibold text-muted-foreground">
              <Timer className="w-3 h-3" />
              {timer.formatted}
            </div>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setChatOpen(true)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center relative">
              <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
              {hasUnreadChat && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />}
            </motion.button>
          </div>
        </motion.div>

        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          {/* Opponent Area */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
            <motion.div
              className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center text-xl font-display font-bold text-white relative shadow-lg"
              animate={gameState === "reveal" ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              {opponentName[0]?.toUpperCase()}
              {gameState === "reveal" && (
                <motion.div className="absolute inset-0 rounded-full border-2 border-primary" animate={{ scale: [1, 1.3], opacity: [0.6, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />
              )}
            </motion.div>
            <span className="text-xs text-muted-foreground font-semibold">{opponentName}</span>

            <AnimatePresence mode="wait">
              {opponentChoice ? (
                <motion.span key="opp-choice" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="text-6xl">
                  {choices.find((c) => c.id === opponentChoice)?.emoji}
                </motion.span>
              ) : gameState === "reveal" ? (
                <motion.div key="countdown" className="w-16 h-16 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.span key={revealCountdown} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="text-4xl font-display font-extrabold text-primary">
                      {revealCountdown > 0 ? revealCountdown : "🤔"}
                    </motion.span>
                  </AnimatePresence>
                </motion.div>
              ) : opponentHasMoved ? (
                <motion.div key="opponent-ready" initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/20 border border-accent/30">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[10px] font-display font-bold text-accent uppercase tracking-wider">Ready!</span>
                </motion.div>
              ) : playerChoice ? (
                <motion.span key="waiting" animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-5xl">❓</motion.span>
              ) : (
                <div className="h-[64px]" />
              )}
            </AnimatePresence>
          </motion.div>

          {/* VS / Result */}
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div key="result" initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="flex flex-col items-center gap-3 relative">
                <motion.div className={`px-8 py-4 rounded-2xl ${result === "win" ? "bg-primary/20" : result === "lose" ? "bg-destructive/20" : "bg-muted"}`}>
                  <motion.span className={`text-3xl font-display font-extrabold ${result === "win" ? "text-primary" : result === "lose" ? "text-destructive" : "text-muted-foreground"}`} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                    {result === "win" ? "YOU WIN! 🎉" : result === "lose" ? "YOU LOSE 💀" : "DRAW 🤝"}
                  </motion.span>
                </motion.div>
                {resultReasonText && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground italic">
                    {resultReasonText}
                  </motion.p>
                )}
                <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={`text-xl font-display font-bold ${result === "win" ? "text-primary" : result === "lose" ? "text-destructive" : "text-muted-foreground"}`}>
                  {result === "win" ? `+$${winAmount ? winAmount - stake : stake}` : result === "lose" ? `-$${stake}` : "$0"}
                </motion.span>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-xs text-muted-foreground flex items-center gap-1">
                  <Timer className="w-3 h-3" /> Match duration: {timer.formatted}
                </motion.p>
                <div className="flex gap-2 mt-2">
                  <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} whileTap={{ scale: 0.9 }} onClick={sendRematch} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm glow-primary flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4" /> Rematch
                  </motion.button>
                  <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} whileTap={{ scale: 0.9 }} onClick={fullReset} className="px-6 py-3 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border">
                    Exit
                  </motion.button>
                </div>
              </motion.div>
            ) : gameState === "playing" ? (
              <motion.div key="vs" animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}>
                <span className="text-2xl font-display font-extrabold text-muted-foreground">VS</span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Player Choice Display */}
          <AnimatePresence>
            {playerChoice && (
              <motion.div initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 200 }} className="flex flex-col items-center gap-2">
                <motion.span className="text-6xl" animate={gameState === "reveal" ? { y: [0, -8, 0] } : {}} transition={{ duration: 0.3, repeat: Infinity }}>
                  {choices.find((c) => c.id === playerChoice)?.emoji}
                </motion.span>
                <span className="text-xs text-muted-foreground">You</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Choice Buttons */}
        {!playerChoice && gameState === "playing" && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }} className="flex justify-center gap-4 pb-24">
            {choices.map((c, i) => (
              <motion.button key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }} whileTap={{ scale: 0.85, rotate: -5 }} whileHover={{ scale: 1.1, y: -4 }} onClick={() => play(c.id)} className="w-24 h-24 rounded-2xl card-game flex flex-col items-center justify-center gap-1.5 border border-border hover:border-primary/50 transition-colors relative overflow-hidden group">
                <motion.span className="text-4xl" animate={{ rotate: [0, -3, 3, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}>
                  {c.emoji}
                </motion.span>
                <span className="text-[10px] font-display font-semibold text-muted-foreground">{c.label}</span>
                <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors rounded-2xl" />
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      <TurnTimerCountdown remainingMs={turnDeadline} isMyTurn={isMyTurn} />

      <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["game", "global"]} currentChannel="game" socketRef={socketRef} gameType="RPS" matchId={matchId || undefined} onUnreadMessagesChange={setHasUnreadChat} />
    </PageTransition>
  );
};

export default RockPaperScissors;
