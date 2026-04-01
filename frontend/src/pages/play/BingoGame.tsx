import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, Timer, RotateCcw, Trophy, Check, Hash, Target, Users, User, AlertTriangle, WifiOff } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import MatchLobby from "@/components/game/MatchLobby";
import { ConfettiExplosion, PageTransition, sounds } from "@/components/game/AnimationEffects";
import ChatSystem from "@/components/game/ChatSystem";
import GameCountdown from "@/components/game/GameCountdown";
import PlayerMatchTransition from "@/components/game/PlayerMatchTransition";
import TurnTimerCountdown from "@/components/game/TurnTimerCountdown";
import { useMatchTimer } from "@/hooks/useMatchTimer";
import { getSocket } from "@/lib/socket";

type GameState = "lobby" | "matching" | "countdown" | "match-found" | "playing" | "result";

interface PlayerInfo {
  userId: string;
  username: string;
  level: number;
  avatar?: string | null;
}

const BINGO_LETTERS = ["B", "I", "N", "G", "O"] as const;

const BingoGame = () => {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [stake, setStake] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const rejoinData = (location.state as any)?.rejoin;

  // Board & game state
  const [board, setBoard] = useState<number[]>([]);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [playerLines, setPlayerLines] = useState<Record<string, number>>({});
  const [lastCalledNumber, setLastCalledNumber] = useState<number | null>(null);

  // Turn state — server-driven boolean
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Players info
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([]);
  // Server-confirmed userId for this client — used for all filtering
  const [serverMyUserId, setServerMyUserId] = useState<string>("");

  // Match meta
  const [winner, setWinner] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [queuePlayerCount, setQueuePlayerCount] = useState(0);

  // Exit dialog & Disconnect state
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState(60);
  const [disconnectedOpponentName, setDisconnectedOpponentName] = useState("Opponent");
  const disconnectTimerRef = useRef<any>(null);
  const opponentDisconnectedRef = useRef(false);
  const [forfeitedPlayerIds, setForfeitedPlayerIds] = useState<Set<string>>(new Set());

  const timer = useMatchTimer();
  const socketRef = useRef<any>(null);

  const calledSet = new Set(calledNumbers);
  const myLines = playerLines[serverMyUserId] || 0;
  // Filter OTHER players using server-confirmed userId
  const otherPlayers = allPlayers.filter(p => p.userId !== serverMyUserId);
  const myPlayerInfo = allPlayers.find(p => p.userId === serverMyUserId);
  
  useEffect(() => {
    socketRef.current = getSocket();

    if (rejoinData) {
      console.log("[BINGO FE] Rejoining from navigation state:", rejoinData);
      setCurrentMatch(rejoinData);
      setStake(rejoinData.stake || 0);
      if (rejoinData.board) setBoard(rejoinData.board);
      if (rejoinData.calledNumbers) setCalledNumbers(rejoinData.calledNumbers);
      if (rejoinData.playerLines) setPlayerLines(rejoinData.playerLines);
      if (rejoinData.myUserId) setServerMyUserId(rejoinData.myUserId);
      if (rejoinData.allPlayers) setAllPlayers(rejoinData.allPlayers);
      setIsMyTurn(rejoinData.isYourTurn === true);
      setGameState("playing");
      timer.start();
      // Ask the server for the latest full game state
      socketRef.current.emit("requestRejoin", { matchId: rejoinData.matchId });
    }

    socketRef.current.on("matchFound", (match: any) => {
      console.log("[BINGO FE] matchFound:", match);
      setCurrentMatch(match);
      if (match.allPlayers) {
        setAllPlayers(match.allPlayers);
      }
      setGameState("match-found");
      sounds.matchFound?.();
    });

    socketRef.current.on("bingoGameStart", (data: any) => {
      console.log("[BINGO FE] bingoGameStart:", { myUserId: data.myUserId, currentTurn: data.currentTurn, isYourTurn: data.isYourTurn });
      // Store the server-confirmed userId for this client
      if (data.myUserId) {
        setServerMyUserId(data.myUserId);
      }
      setBoard(data.board);
      setCalledNumbers([]);
      setPlayerLines({});
      setLastCalledNumber(null);
      setIsMyTurn(data.isYourTurn === true);
      if (data.allPlayers) {
        setAllPlayers(data.allPlayers);
      }
    });

    socketRef.current.on("bingoNumberCalled", (data: any) => {
      console.log("[BINGO FE] bingoNumberCalled:", { number: data.number, isYourTurn: data.isYourTurn });
      setCalledNumbers(data.calledNumbers);
      setLastCalledNumber(data.number);
      sounds.tap();
      setIsMyTurn(data.isYourTurn === true);
      if (data.playerLines) {
        setPlayerLines(data.playerLines);
      }
    });

    socketRef.current.on("startTurnTimer", (data: any) => {
      // Ignore timer events while an opponent is disconnected (game is paused)
      if (opponentDisconnectedRef.current) {
        console.log("[BINGO FE] Ignoring startTurnTimer — opponent disconnected");
        return;
      }
      console.log("[BINGO FE] startTurnTimer:", { isYourTurn: data.isYourTurn, remainingMs: data.remainingMs });
      setTurnDeadline(data.remainingMs ?? null);
      setIsMyTurn(data.isYourTurn === true);
    });

    socketRef.current.on("bingoQueueUpdate", (data: any) => {
      setQueuePlayerCount(data.playerCount || 0);
    });

    socketRef.current.on("matchUpdate", (match: any) => {
      if (match.status === "FINISHED") {
        console.log("[BINGO FE] matchUpdate FINISHED:", { result: match.result, winnerId: match.winnerId });
        setMatchResult(match);
        // Use server-sent per-player result instead of comparing winnerId
        const isWin = match.result === "win";
        setWinner(isWin ? "You" : "Opponent");
        setGameState("result");
        setTurnDeadline(null);
        setIsMyTurn(false);
        timer.stop();

        if (match.playerLines) {
          setPlayerLines(match.playerLines);
        }

        if (isWin) {
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

    socketRef.current.on("rejoinedMatch", (data: any) => {
      console.log("[BINGO FE] rejoinedMatch via socket:", data);
      setCurrentMatch(data);
      setStake(data.stake || 0);
      if (data.board) setBoard(data.board);
      if (data.calledNumbers) setCalledNumbers(data.calledNumbers);
      if (data.playerLines) setPlayerLines(data.playerLines);
      if (data.myUserId) setServerMyUserId(data.myUserId);
      if (data.allPlayers) setAllPlayers(data.allPlayers);
      setIsMyTurn(data.isYourTurn === true);
      if (gameState === "lobby" || gameState === "matching") {
        setGameState("playing");
        // Restore the match elapsed timer from the server-provided start time
        if (data.matchStartedAt) {
          timer.startFrom(data.matchStartedAt);
        } else {
          timer.start();
        }
      }
    });

    socketRef.current.on("opponentDisconnected", (data: any) => {
      setOpponentDisconnected(true);
      opponentDisconnectedRef.current = true;
      setDisconnectedOpponentName(data.opponentName || "Opponent");
      setTurnDeadline(null); // Freeze the turn timer display
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
      timer.pause(); // Pause our visual timer while waiting
    });

    // timerFrozen: emitted to ALL players when ANY player disconnects.
    // Freeze the turn timer display so no one sees a running clock while game is paused.
    socketRef.current.on("timerFrozen", () => {
      setTurnDeadline(null);
    });

    socketRef.current.on("opponentReconnected", () => {
      setOpponentDisconnected(false);
      opponentDisconnectedRef.current = false;
      setDisconnectCountdown(60);
      if (disconnectTimerRef.current) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      timer.resume(); // Resume timer
    });

    // Dual-disconnect: this player rejoined but the opponent is still gone.
    // Show the waiting overlay rather than resuming the game.
    socketRef.current.on("opponentStillDisconnected", (data: any) => {
      setOpponentDisconnected(true);
      opponentDisconnectedRef.current = true;
      setDisconnectedOpponentName(data.opponentName || "Opponent");
      setTurnDeadline(null);
      const deadline = data.reconnectDeadline;
      if (deadline) {
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
      }
    });

    socketRef.current.on("playerForfeited", (data: any) => {
      console.log("[BINGO FE] playerForfeited:", data);
      // Track this player as forfeited for UI display
      if (data.forfeitedUserId) {
        setForfeitedPlayerIds(prev => new Set(prev).add(data.forfeitedUserId));
      }
    });

    socketRef.current.on("opponentDisconnectResolved", () => {
      console.log("[BINGO FE] opponentDisconnectResolved — dismissing overlay and resuming");
      setOpponentDisconnected(false);
      opponentDisconnectedRef.current = false;
      setDisconnectCountdown(60);
      if (disconnectTimerRef.current) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      timer.resume();
    });

    socketRef.current.on("error", (data: any) => {
      console.error("[BINGO FE] server error:", data.message);
      toast({
        title: "Match Error",
        description: data.message,
        variant: "destructive",
      });
      // If the error means they are kicked/removed/finished, redirect to home
      if (
        typeof data.message === "string" &&
        (data.message.includes("removed") || 
         data.message.includes("already finished") || 
         data.message.includes("not found") ||
         data.message.includes("not a participant"))
      ) {
        navigate("/");
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
    setQueuePlayerCount(1);
    socketRef.current?.emit("joinMatch", { gameType: "BINGO", stake });
  };

  const handleCancelMatchmaking = () => {
    sounds.tap();
    socketRef.current?.emit("leaveQueue");
    setGameState("lobby");
    setQueuePlayerCount(0);
  };

  const handleCallNumber = (num: number) => {
    if (!isMyTurn || calledSet.has(num) || !!winner) return;
    sounds.success();
    setIsMyTurn(false);
    socketRef.current?.emit("bingoCall", {
      matchId: currentMatch?.matchId,
      number: num,
    });
  };

  const handleCountdownComplete = useCallback(() => {
    setGameState("match-found");
  }, []);

  const handleMatchTransitionComplete = useCallback(() => {
    setGameState("playing");
    timer.start();
  }, [timer]);

  const resetGame = () => {
    setCalledNumbers([]);
    setBoard([]);
    setWinner(null);
    setPlayerLines({});
    setIsMyTurn(false);
    setLastCalledNumber(null);
    setTurnDeadline(null);
    setMatchResult(null);
    setAllPlayers([]);
    setServerMyUserId("");
    setQueuePlayerCount(0);
    setShowExitDialog(false);
    setOpponentDisconnected(false);
    if (disconnectTimerRef.current) {
      clearInterval(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    timer.reset();
    setGameState("lobby");
  };

  const handleExitClick = () => {
    if (gameState === "playing") {
      setShowExitDialog(true);
    } else {
      resetGame();
    }
  };

  const confirmExit = () => {
    if (currentMatch?.matchId) {
      socketRef.current?.emit("forfeitMatch", { matchId: currentMatch.matchId });
    }
    setShowExitDialog(false);
  };

  const sendRematch = () => {
    sounds.success();
    resetGame();
    setStake(0);
    setGameState("lobby");
  };

  // ========================
  //    LOBBY
  // ========================
  if (gameState === "lobby") {
    return <MatchLobby gameName="Bingo" emoji="🎱" players="2-4 Players" onStart={handleStartMatchmaking} stake={stake} onStakeChange={setStake} gameType="BINGO" socketRef={socketRef} />;
  }

  // ========================
  //    MATCHING
  // ========================
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
          <span className="text-5xl">🎱</span>
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Searching...</h2>
        <p className="text-muted-foreground text-sm mb-4">Looking for a Bingo match with a {stake} ETB stake...</p>

        {queuePlayerCount >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-display font-bold flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            {queuePlayerCount}/4 players found — starting soon!
          </motion.div>
        )}

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

  // ========================
  //    RESULT
  // ========================
  if (gameState === "result") {
    const isWinner = winner === "You";
    const playerCount = allPlayers.length || 2;
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

          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center justify-center mb-8">
            <Trophy className={`w-24 h-24 ${isWinner ? "text-primary" : "text-muted"} mb-2`} />
            <h2 className={`text-3xl font-display font-extrabold ${isWinner ? "text-primary" : "text-destructive"}`}>
              {isWinner ? "YOU WON! 🎉" : "YOU LOST 💀"}
            </h2>
            {isWinner && matchResult?.commission ? (
              <div className="bg-background/50 border border-border rounded-xl p-3 mt-3 w-56 text-left space-y-1.5 flex flex-col">
                <div className="flex justify-between text-xs text-muted-foreground font-display"><span>Stake:</span> <span>{stake} ETB</span></div>
                <div className="flex justify-between text-xs text-muted-foreground font-display"><span>Total Pot:</span> <span>{stake * playerCount} ETB</span></div>
                <div className="flex justify-between text-xs text-destructive font-display">
                  <span>Commission ({Math.round((matchResult.commission / (stake * playerCount)) * 100)}%):</span> 
                  <span>-{matchResult.commission} ETB</span>
                </div>
                <div className="h-px bg-border my-1 w-full" />
                <div className="flex justify-between text-sm font-bold text-primary font-display"><span>Net Profit:</span> <span>+{matchResult.winAmount - stake} ETB</span></div>
              </div>
            ) : (
              <p className="text-muted-foreground mt-1">{isWinner ? `Won +${matchResult?.winAmount ? matchResult.winAmount - stake : stake * (playerCount - 1)} ETB!` : `Lost -${stake} ETB`}</p>
            )}
            {matchResult?.reason === "opponent_timeout" && (
              <p className="text-xs text-primary mt-1">Opponent ran out of time!</p>
            )}
          </motion.div>

          <div className="card-game rounded-2xl p-6 text-center mb-8">
            <p className="text-xs text-muted-foreground font-display font-bold uppercase mb-3">Player Lines</p>
            <div className="flex justify-around flex-wrap gap-4">
              <div className="flex flex-col items-center">
                {myPlayerInfo?.avatar ? (
                  <img src={myPlayerInfo.avatar} alt="You" className="w-10 h-10 rounded-xl mb-2 object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-xl mb-2 bg-muted flex items-center justify-center border border-border">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <p className="text-2xl font-display font-bold text-primary">{playerLines[serverMyUserId] || 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase">You</p>
              </div>
              {otherPlayers.map(p => {
                const isForfeited = forfeitedPlayerIds.has(p.userId);
                return (
                <div key={p.userId} className={`flex flex-col items-center ${isForfeited ? 'opacity-40' : ''}`}>
                  <div className="relative">
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.username} className={`w-10 h-10 rounded-xl mb-2 object-cover border ${isForfeited ? 'border-red-500/50 grayscale' : 'border-border'}`} />
                    ) : (
                      <div className={`w-10 h-10 rounded-xl mb-2 flex items-center justify-center border ${isForfeited ? 'bg-red-500/10 border-red-500/50' : 'bg-muted border-border'}`}>
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    {isForfeited && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">✕</span>
                      </div>
                    )}
                  </div>
                  <p className="text-2xl font-display font-bold text-foreground">{playerLines[p.userId] || 0}</p>
                  <p className={`text-[10px] uppercase ${isForfeited ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {isForfeited ? 'Left' : p.username}
                  </p>
                </div>
                );
              })}
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{timer.formatted}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Time</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{calledNumbers.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Calls</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-auto mb-8">
            <motion.button whileTap={{ scale: 0.95 }} onClick={sendRematch} className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> Play Again
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={resetGame} className="py-4 px-6 rounded-2xl bg-muted text-foreground font-display font-bold text-sm border border-border">
              Exit
            </motion.button>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ========================
  //    PLAYING STATE
  // ========================

  // Build the players array for the match transition display.
  // Ensure "You" is always index 0.
  const matchPlayers = [
    ...(myPlayerInfo ? [{
      name: "You",
      level: myPlayerInfo.level || 1,
      avatar: myPlayerInfo.avatar || undefined,
      wins: 0,
      streak: 0,
    }] : []),
    ...otherPlayers.map(p => ({
      name: p.username || "Opponent",
      level: p.level || 1,
      avatar: p.avatar || undefined,
      wins: 0,
      streak: 0,
    }))
  ];

  return (
    <PageTransition>
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
              <h3 className="text-lg font-display font-bold text-foreground mb-2">Player Disconnected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                <span className="font-bold text-foreground">{disconnectedOpponentName}</span> has disconnected. 
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
              <p className="text-xs text-muted-foreground mt-1">They will forfeit if the timer expires</p>
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
            players={matchPlayers}
          />
        )}
      </AnimatePresence>

      <TurnTimerCountdown remainingMs={turnDeadline} isMyTurn={isMyTurn} />

      <div className="px-4 pt-6 min-h-screen flex flex-col">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.85 }} onClick={handleExitClick} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
            </motion.button>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">🎱 Bingo</h1>
              <p className="text-xs text-primary font-display font-semibold">{stake} ETB stake • {allPlayers.length} players</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-display font-semibold text-muted-foreground">
              <Timer className="w-3 h-3" />{timer.formatted}
            </div>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setChatOpen(true)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center relative">
              <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
              {hasUnreadChat && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />}
            </motion.button>
          </div>
        </motion.div>

        {/* Turn Indicator */}
        <motion.div
          key={isMyTurn ? "my-turn" : "not-my-turn"}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-center py-2.5 px-4 rounded-xl mb-4 font-display font-bold text-sm transition-all ${
            isMyTurn
              ? "bg-primary/15 text-primary border border-primary/30"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          {isMyTurn ? (
            <span className="flex items-center justify-center gap-2">
              <Target className="w-4 h-4" /> Your Turn — Tap a number to call it!
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Timer className="w-4 h-4" /> Waiting for opponent...
            </span>
          )}
        </motion.div>

        {/* Score Bar — You + other players */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex-1 card-game rounded-xl p-2.5 flex flex-col items-center">
            {myPlayerInfo?.avatar ? (
              <img src={myPlayerInfo.avatar} alt="You" className="w-8 h-8 rounded-full mb-1 object-cover border border-border/50" />
            ) : (
              <div className="w-8 h-8 rounded-full mb-1 bg-muted flex items-center justify-center">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground uppercase font-display font-bold">You</p>
            <p className="text-xl font-display font-extrabold text-primary">{myLines}<span className="text-xs text-muted-foreground">/5</span></p>
          </div>
          {otherPlayers.map(p => {
            const isForfeited = forfeitedPlayerIds.has(p.userId);
            return (
            <div key={p.userId} className={`flex-1 card-game rounded-xl p-2.5 flex flex-col items-center ${isForfeited ? 'opacity-40' : ''}`}>
              <div className="relative">
                {p.avatar ? (
                  <img src={p.avatar} alt={p.username} className={`w-8 h-8 rounded-full mb-1 object-cover border ${isForfeited ? 'border-red-500/50 grayscale' : 'border-border/50'}`} />
                ) : (
                  <div className={`w-8 h-8 rounded-full mb-1 flex items-center justify-center ${isForfeited ? 'bg-red-500/10' : 'bg-muted'}`}>
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                {isForfeited && (
                  <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-white text-[7px] font-bold">✕</span>
                  </div>
                )}
              </div>
              <p className={`text-[10px] uppercase font-display font-bold truncate max-w-[60px] ${isForfeited ? 'text-red-400' : 'text-muted-foreground'}`}>
                {isForfeited ? 'Left' : p.username}
              </p>
              <p className="text-xl font-display font-extrabold text-foreground">{playerLines[p.userId] || 0}<span className="text-xs text-muted-foreground">/5</span></p>
            </div>
            );
          })}
        </div>

        {/* BINGO Letters Progress */}
        <div className="flex justify-center gap-2 mb-4">
          {BINGO_LETTERS.map((l, i) => (
            <motion.div
              key={l}
              animate={i < myLines ? { scale: [1, 1.2, 1], backgroundColor: "var(--primary)" } : {}}
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-display font-extrabold text-lg border-2 transition-colors ${
                i < myLines
                  ? "bg-primary border-primary text-white"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              {l}
            </motion.div>
          ))}
        </div>

        {/* Last Called Number */}
        {lastCalledNumber && (
          <div className="flex items-center justify-center mb-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={lastCalledNumber}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                className="w-16 h-16 rounded-full bg-primary flex items-center justify-center border-4 border-primary-foreground/20 shadow-xl relative overflow-hidden"
              >
                <motion.div className="absolute inset-0 bg-white/10" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
                <span className="text-2xl font-display font-black text-primary-foreground relative z-10">
                  {lastCalledNumber}
                </span>
              </motion.div>
            </AnimatePresence>
            <span className="ml-3 text-xs text-muted-foreground font-display">Last called</span>
          </div>
        )}

        {/* Board — 5x5 grid */}
        <div className="grid grid-cols-5 gap-2 max-w-sm mx-auto mb-4">
          {board.map((num, i) => {
            const isCalled = calledSet.has(num);
            const canCall = isMyTurn && !isCalled && !winner;
            return (
              <motion.button
                key={i}
                whileTap={canCall ? { scale: 0.9 } : {}}
                onClick={() => handleCallNumber(num)}
                disabled={!canCall}
                className={`aspect-square rounded-xl flex items-center justify-center font-display font-bold text-lg relative transition-all ${
                  isCalled
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : canCall
                    ? "bg-muted border-2 border-primary/50 text-foreground hover:border-primary hover:bg-primary/10 cursor-pointer"
                    : "bg-muted border border-border text-foreground/50"
                }`}
              >
                {num}
                {isCalled && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Called Numbers History */}
        {calledNumbers.length > 0 && (
          <div className="card-game rounded-xl p-3 mb-4">
            <p className="text-[10px] text-muted-foreground uppercase font-display font-bold mb-2 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Called Numbers ({calledNumbers.length}/25)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {calledNumbers.map((num, i) => (
                <span
                  key={i}
                  className="w-7 h-7 rounded-lg bg-primary/15 text-primary text-xs font-display font-bold flex items-center justify-center"
                >
                  {num}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-24 italic">
          {myLines < 5 ? `Complete 5 lines to win! You: ${myLines}/5` : "BINGO! 🎉"}
        </p>
      </div>

      <ChatSystem isOpen={chatOpen} onClose={() => setChatOpen(false)} availableChannels={["game", "global"]} currentChannel="game" socketRef={socketRef} gameType="BINGO" matchId={currentMatch?.matchId} onUnreadMessagesChange={setHasUnreadChat} />
    </PageTransition>
  );
};

export default BingoGame;
