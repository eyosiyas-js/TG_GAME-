import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, Users, Dices, RotateCcw, Check, Timer, WifiOff } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getFullUrl } from "@/lib/api";
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
  const location = useLocation();
  const rejoinData = (location.state as any)?.rejoin;

  const [gameState, setGameState] = useState<GameState>("lobby");
  const [stake, setStake] = useState(0);
  const [turnTimerKey, setTurnTimerKey] = useState(0);
  const [playerDice, setPlayerDice] = useState<[number, number]>([0, 0]);
  const [rollCount, setRollCount] = useState(0);
  const [turnScore, setTurnScore] = useState(0);
  const [myDone, setMyDone] = useState(false);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentRolls, setOpponentRolls] = useState(0);
  const [opponentDone, setOpponentDone] = useState(false);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [opponentRolling, setOpponentRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const { shake, shakeClass } = useScreenShake();
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePlayer, setProfilePlayer] = useState<string | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState(0);
  const disconnectTimerRef = useRef<any>(null);
  const timer = useMatchTimer();

  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const matchRef = useRef<any>(null);
  const isRollingRef = useRef(false);
  const [opponentRoll, setOpponentRoll] = useState<[number, number] | null>(null);

  const socketRef = useRef<any>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    socketRef.current = getSocket();

    socketRef.current.on("connect", () => {
      const matchData = matchRef.current;
      const mId = matchData?.id || matchData?.matchId;
      if (mId) {
        socketRef.current.emit("requestRejoin", { matchId: mId });
      }
    });

    if (rejoinData) {
      setCurrentMatch(rejoinData);
      matchRef.current = rejoinData;
      setStake(rejoinData.stake || 0);
      setGameState("match-found");
      socketRef.current.emit("requestRejoin", { matchId: rejoinData.matchId });
    }

    socketRef.current.on("matchFound", (match: any) => {
      setCurrentMatch(match);
      matchRef.current = match;
      setGameState("match-found");
      sounds.matchFound?.();

      // Handle DICE rejoin state
      if ((match.gameType === "DICE" || match.gameType === "dice") && match.diceState) {
        const ds = match.diceState;
        setTurnScore(ds.myScore);
        setRollCount(ds.myRolls);
        setMyDone(ds.myDone);
        setOpponentScore(ds.opponentScore);
        setOpponentRolls(ds.opponentRolls);
        setOpponentDone(ds.opponentDone);
        if (ds.myLastRoll && ds.myLastRoll[0]) setPlayerDice(ds.myLastRoll);
        if (ds.opponentLastRoll && ds.opponentLastRoll[0]) setOpponentRoll(ds.opponentLastRoll);
        setLanded(true);
      }

      // Restore elapsed match timer from server timestamp
      if (match.matchStartedAt) {
        timer.startFrom(match.matchStartedAt);
      }
    });

    socketRef.current.on("matchUpdate", (match: any) => {
      setCurrentMatch(match);
      matchRef.current = match;

      if (match.status === "FINISHED") {
        setOpponentDisconnected(false);
        if (disconnectTimerRef.current) {
          clearInterval(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setTurnDeadline(null);
        const userId = localStorage.getItem("userId");
        const myMoveString = match.yourMove || (match.moves || []).find((m: any) => m.userId === userId)?.move;
        const opMoveString = match.opponentMove || (match.moves || []).find((m: any) => m.userId !== userId)?.move;
        
        if (opMoveString) {
          const rolls = opMoveString.replace("roll:", "").split(",").map(Number);
          setOpponentRoll([rolls[0] || 1, rolls[1] || 1]);
        }

        if (myMoveString) {
          const rolls = myMoveString.replace("roll:", "").split(",").map(Number);
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
      setTurnDeadline(data.remainingMs ?? null);
      setTurnTimerKey(prev => prev + 1);
    });

    socketRef.current.on("diceUpdate", (data: any) => {
      if (isRollingRef.current && data.myLastRoll) {
        // We are locally expecting an animation! 
        // Delay applying the server truth until 1.2s of fake rolling completes.
        isRollingRef.current = false;
        
        const flashInterval = setInterval(() => {
          setPlayerDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
        }, 80);

        setTimeout(() => {
          clearInterval(flashInterval);
          setTurnScore(data.myScore);
          setRollCount(data.myRolls);
          setMyDone(data.myDone);
          
          setOpponentScore(data.opponentScore);
          setOpponentRolls(data.opponentRolls);
          setOpponentDone(data.opponentDone);

          if (data.myLastRoll && data.myLastRoll[0]) setPlayerDice(data.myLastRoll);
          if (data.opponentLastRoll && data.opponentLastRoll[0]) setOpponentRoll(data.opponentLastRoll);

          setRolling(false);
          setOpponentRolling(false);
          setLanded(true);
          sounds.select();
        }, 1200);
      } else {
        // Instant update (either a keep, or an opponent's roll arrived)
        setTurnScore(data.myScore);
        setRollCount(data.myRolls);
        setMyDone(data.myDone);
        
        setOpponentScore(data.opponentScore);
        setOpponentRolls(data.opponentRolls);
        setOpponentDone(data.opponentDone);

        if (data.myLastRoll && data.myLastRoll[0]) {
          setPlayerDice(data.myLastRoll);
        }
        if (data.opponentLastRoll && data.opponentLastRoll[0]) {
          setOpponentRoll(data.opponentLastRoll);
        }

        setRolling(false);
        setOpponentRolling(false);
        setLanded(true);
      }
    });

    socketRef.current.on("opponentRolling", () => {
       setOpponentRolling(true);
    });

    socketRef.current.on("opponentDisconnected", (data: any) => {
      setOpponentDisconnected(true);
      // Freeze the turn timer display — timers are paused on the server
      setTurnDeadline(null);
      const deadline = data.reconnectDeadline;
      const updateCountdown = () => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setDisconnectCountdown(remaining);
      };
      updateCountdown();
      disconnectTimerRef.current = setInterval(updateCountdown, 1000);
    });

    // timerFrozen: emitted to ALL players the moment someone disconnects.
    // Freeze the turn timer display so no one sees a running clock while game is paused.
    socketRef.current.on("timerFrozen", () => {
      setTurnDeadline(null);
    });

    socketRef.current.on("opponentReconnected", () => {
      setOpponentDisconnected(false);
      if (disconnectTimerRef.current) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    });

    socketRef.current.on("opponentDisconnectResolved", () => {
      setOpponentDisconnected(false);
      if (disconnectTimerRef.current) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    });

    socketRef.current.on("rejoinedMatch", (data: any) => {
      setCurrentMatch(data);
      matchRef.current = data;
      setStake(data.stake || 0);

      // Handle DICE rejoin state
      if (data.diceState) {
        const ds = data.diceState;
        setTurnScore(ds.myScore);
        setRollCount(ds.myRolls);
        setMyDone(ds.myDone);
        setOpponentScore(ds.opponentScore);
        setOpponentRolls(ds.opponentRolls);
        setOpponentDone(ds.opponentDone);
        if (ds.myLastRoll && ds.myLastRoll[0]) setPlayerDice(ds.myLastRoll);
        if (ds.opponentLastRoll && ds.opponentLastRoll[0]) setOpponentRoll(ds.opponentLastRoll);
        setLanded(true);
      }

      if (gameState === "lobby" || gameState === "matching") {
        setGameState("playing");
      }
    });

    // Dual-disconnect: this player rejoined but the opponent is still gone.
    // Show the waiting overlay rather than resuming.
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

    return () => {
      socketRef.current?.disconnect();
      if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    const token = localStorage.getItem("token");
    if (!userId || !token) return;

    queryClient.fetchQuery({ queryKey: ["active-match"], queryFn: () => api.get("/game/active-match", token) }).then((match) => {
      if (match && match.gameType === "DICE") {
        setCurrentMatch(match);
        matchRef.current = match;
        setGameState("playing");
        setStake(match.stake);
        
        if (match.diceState) {
          const ds = match.diceState;
          setTurnScore(ds.myScore);
          setRollCount(ds.myRolls);
          setMyDone(ds.myDone);
          setOpponentScore(ds.opponentScore);
          setOpponentRolls(ds.opponentRolls);
          setOpponentDone(ds.opponentDone);
          if (ds.myLastRoll && ds.myLastRoll[0]) setPlayerDice(ds.myLastRoll);
          if (ds.opponentLastRoll && ds.opponentLastRoll[0]) setOpponentRoll(ds.opponentLastRoll);
          setLanded(true);
        }

        setTimeout(() => {
           socketRef.current?.emit("requestRejoin", { matchId: match.id }); 
        }, 500);
      }
    });
  }, [queryClient]);

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

  const { start: startMatchTimer } = timer;
  const handleMatchTransitionComplete = useCallback(() => {
    setGameState("playing");
    startMatchTimer();
  }, [startMatchTimer]);

  const doRoll = useCallback((action: 'roll' | 'roll_again' | 'keep') => {
    if (rolling || myDone) return;
    
    const mId = currentMatch?.id || currentMatch?.matchId;
    if (!mId) return;

    if (action === 'keep') {
       socketRef.current?.emit("submitMove", { matchId: mId, move: "keep" });
       return;
    }

    // We are now Server-Authoritative!
    isRollingRef.current = true;
    setRolling(true);
    setLanded(false);
    sounds.roll();
    socketRef.current?.emit("startRolling", { matchId: mId });
    // Emit instantly! The backend computes instantly. 
    // The `diceUpdate` socket listener will catch it and run the animation.
    socketRef.current?.emit("submitMove", { matchId: mId, move: action });
  }, [rolling, myDone, currentMatch]);

  const [showExitDialog, setShowExitDialog] = useState(false);

  const handleExitClick = () => {
    if (gameState === "playing") {
      setShowExitDialog(true);
    } else {
      resetGame();
    }
  };

  const confirmExit = () => {
    const mId = currentMatch?.id || currentMatch?.matchId;
    if (mId) {
      socketRef.current?.emit("forfeitMatch", { matchId: mId });
    }
    setShowExitDialog(false);
  };

  const resetGame = () => {
    setPlayerDice([0, 0]);
    setRollCount(0);
    setTurnScore(0);
    setMyDone(false);
    setOpponentScore(0);
    setOpponentRolls(0);
    setOpponentDone(false);
    setOpponentRoll(null);
    setRolling(false);
    isRollingRef.current = false;
    setOpponentRolling(false);
    setLanded(false);
    setWinner(null);
    setShowConfetti(false);
    setTurnDeadline(null);
    setShowExitDialog(false);
    setOpponentDisconnected(false);
    if (disconnectTimerRef.current) {
      clearInterval(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
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
          Searching for a Dice Battle with a {stake} ETB stake...
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
    const myMatchMove = currentMatch?.moves?.find((m: any) => m.userId === userId)?.move || currentMatch?.yourMove;
    const opMatchMove = currentMatch?.moves?.find((m: any) => m.userId !== userId)?.move || currentMatch?.opponentMove;
    const opponentName = currentMatch?.opponentName || "Opponent";

    const parseMove = (m: string) => {
      if (!m) return { sum: 0, text: "0+0" };
      const val = m.replace("roll:", "");
      if (val.includes(",")) {
        const parts = val.split(",").map(Number);
        return { sum: (parts[0] || 0) + (parts[1] || 0), text: `${parts[0]}+${parts[1]}` };
      }
      return { sum: Number(val), text: `${val}+0` };
    };

    const myRes = parseMove(myMatchMove);
    const opRes = parseMove(opMatchMove);

    const allScores = [
      { name: "You", score: myRes.sum, rolls: myRes.text, isMe: true },
      { name: opponentName, score: opRes.sum, rolls: opRes.text, isMe: false }
    ].sort((a, b) => b.score - a.score);

    const isWinner = currentMatch?.winnerId === userId;
    const isDraw = currentMatch?.winnerId === null && currentMatch?.status === "FINISHED" && currentMatch?.reason !== "forfeit" && currentMatch?.reason !== "opponent_timeout" && currentMatch?.reason !== "timeout";

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
              {currentMatch?.reason === 'opponent_timeout' && isWinner && (
                <p className="text-sm font-bold text-primary mt-2">Opponent was unable to make a move.</p>
              )}
              {currentMatch?.reason === 'timeout' && !isWinner && (
                <p className="text-sm font-bold text-destructive mt-2">You ran out of time!</p>
              )}
              {currentMatch?.reason === 'forfeit' && isWinner && (
                <p className="text-sm font-bold text-primary mt-2">Opponent has left the match.</p>
              )}
              {currentMatch?.reason === 'forfeit' && !isWinner && (
                <p className="text-sm font-bold text-destructive mt-2">You forfeited the match.</p>
              )}
              {currentMatch?.commission !== undefined ? (
                <div className="bg-background/50 border border-border rounded-xl p-3 mt-4 mx-auto w-56 text-left space-y-1.5 flex flex-col">
                  <div className="flex justify-between text-xs text-muted-foreground font-display"><span>Stake:</span> <span>{stake} ETB</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground font-display"><span>Total Pot:</span> <span>{stake * 2} ETB</span></div>
                  <div className="flex justify-between text-xs text-destructive font-display">
                    <span>Commission ({Math.round((currentMatch.commission / (stake * 2)) * 100)}%):</span> 
                    <span>-{currentMatch.commission} ETB</span>
                  </div>
                  <div className="h-px bg-border my-1 w-full" />
                  {isWinner ? (
                    <div className="flex justify-between text-sm font-bold text-primary font-display"><span>Net Profit:</span> <span>+{currentMatch.winAmount - stake} ETB</span></div>
                  ) : isDraw ? (
                    <div className="flex justify-between text-sm font-bold text-foreground font-display"><span>Net Profit:</span> <span>0 ETB</span></div>
                  ) : (
                    <div className="flex justify-between text-sm font-bold text-destructive font-display"><span>Net Loss:</span> <span>-{stake} ETB</span></div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-3">
                  {isWinner ? `Won +${currentMatch?.winAmount ? currentMatch.winAmount - stake : stake} ETB!` : isDraw ? "Stake refunded!" : `Lost -${stake} ETB`}
                </p>
              )}
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
                Your stake of <span className="font-bold text-foreground">{stake} ETB</span> will be forfeited.
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
          <PlayerMatchTransition 
            onComplete={handleMatchTransitionComplete}
            players={(currentMatch?.allPlayers || []).map((p: any) => ({
              name: p.userId === localStorage.getItem("userId") ? "You" : (p.username || "Opponent"),
              level: p.level || 1,
              wins: p.wins || 0,
              streak: p.streak || 0,
              avatar: getFullUrl(p.avatar),
              userId: p.userId
            }))}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {opponentDisconnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
          >
            <WifiOff className="w-16 h-16 text-destructive mb-4 animate-pulse" />
            <h2 className="text-2xl font-display font-bold mb-2">Opponent Disconnected</h2>
            <p className="text-muted-foreground mb-6">Waiting for them to reconnect...</p>
            <div className="text-4xl font-display font-black text-primary">
              {disconnectCountdown}s
            </div>
          </motion.div>
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
              <p className="text-xs text-primary font-display font-semibold">{stake} ETB stake</p>
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
              {hasUnreadChat && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />}
            </motion.button>
          </div>
        </motion.div>

        {/* Opponent Info */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center bg-muted/50 rounded-xl p-3 mb-4">
           <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-display font-bold">Opponent</span>
              <span className="text-sm font-display font-bold text-foreground">
                {currentMatch?.opponentName || 'Player'} ({opponentRolling ? 'Rolling...' : opponentDone ? 'Finished' : 'Playing...'})
              </span>
           </div>
           <div className="flex gap-2">
              <div className="bg-background rounded-lg px-2 py-1 text-center">
                 <span className="text-[10px] text-muted-foreground block font-bold uppercase">Rolls</span>
                 <span className="text-xs font-bold text-foreground">{opponentRolls}/2</span>
              </div>
           </div>
        </motion.div>

        {/* Roll info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-3 mb-6">
          <div className="flex-1 card-game rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground font-display">Your Rolls</p>
            <p className="text-xl font-display font-extrabold text-foreground">{rollCount}/2</p>
          </div>
          <div className="flex-1 card-game rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground font-display">Your Score</p>
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
                {playerDice[0]} + {playerDice[1]} = <motion.span className="text-foreground font-bold text-base" initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{turnScore}</motion.span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="pb-24 space-y-3">
          <AnimatePresence mode="wait">
            {!myDone ? (
              <motion.div key="action-buttons" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex gap-3">
                {rollCount === 0 ? (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => doRoll('roll')} disabled={rolling} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary flex items-center justify-center gap-2">
                    <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 1, repeat: Infinity }}>
                      <Dices className="w-5 h-5" />
                    </motion.div>
                    Roll Dice
                  </motion.button>
                ) : (
                  <>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => doRoll('keep')} disabled={rolling} className="flex-1 py-4 rounded-xl bg-muted text-foreground border border-border font-display font-bold flex items-center justify-center gap-2">
                      <Check className="w-5 h-5 text-emerald-500" /> Keep '{turnScore}'
                    </motion.button>
                    {rollCount < 2 && (
                       <motion.button whileTap={{ scale: 0.95 }} onClick={() => doRoll('roll_again')} disabled={rolling} className="flex-1 py-4 rounded-xl bg-primary text-primary-foreground font-display font-bold glow-primary flex items-center justify-center gap-2">
                         <RotateCcw className="w-5 h-5" /> Roll Again
                       </motion.button>
                    )}
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4 text-center">
                <p className="text-muted-foreground font-display font-bold animate-pulse">Waiting for Opponent...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Only show the turn timer after at least one player has rolled — prevents penalizing players for initial load delays */}
      <TurnTimerCountdown key={turnTimerKey} remainingMs={rollCount > 0 || opponentRolls > 0 ? turnDeadline : null} isMyTurn={!myDone} />

      <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["game", "global"]} currentChannel="game" socketRef={socketRef} gameType="DICE" matchId={currentMatch?.matchId} onUnreadMessagesChange={setHasUnreadChat} />
      <PlayerProfileSheet isOpen={profileOpen} onClose={() => setProfileOpen(false)} playerName={profilePlayer} />
    </PageTransition>
  );
};

export default DiceBattle;
