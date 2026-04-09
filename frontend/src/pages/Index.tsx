import { motion } from "framer-motion";
import { useState } from "react";
import { Trophy, Zap, Users, ChevronRight, Bell, Loader2, AlertTriangle, Wrench } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import GameCard from "@/components/GameCard";
import { staggerContainer, staggerItem } from "@/components/game/AnimationEffects";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3005';

const gameRoutes: Record<string, string> = {
  RPS: "/play/rps",
  DICE: "/play/dice",
  GUESS: "/play/guess",
  BINGO: "/play/bingo",
};

const gameEmojis: Record<string, string> = {
  RPS: "✊",
  DICE: "🎲",
  GUESS: "🔢",
  BINGO: "🎱",
};

const games = [
  { id: "rps", name: "Rock Paper Scissors", players: "1v1", activePlayers: 12, emoji: "✊", gradient: "from-primary/20 to-primary/5", path: "/play/rps" },
  { id: "bingo", name: "Bingo", players: "1v1", activePlayers: 8, emoji: "🎱", gradient: "from-secondary/20 to-secondary/5", path: "/play/bingo" },
  { id: "guess", name: "Guess My Number", players: "1v1", activePlayers: 6, emoji: "🔢", gradient: "from-accent/20 to-accent/5", path: "/play/guess", comingSoon: true },
  { id: "dice", name: "Dice Battle", players: "1v1", activePlayers: 10, emoji: "🎲", gradient: "from-primary/20 to-accent/5", path: "/play/dice" },
];

const Index = () => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token") || "";
  const username = localStorage.getItem("username") || "Player";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // "expired" = match ended before user clicked Rejoin
  const [rejoinStatus, setRejoinStatus] = useState<"idle" | "checking" | "expired">("idle");

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => api.get("/wallet/balance", token),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => api.get("/game/stats", token),
  });

  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => api.get("/auth/profile", token),
  });

  const avatarUrl = profileData?.avatar
    ? `${API_BASE_URL}${profileData.avatar}`
    : null;

  const [dismissedMatchIds, setDismissedMatchIds] = useState<Set<string>>(new Set());

  const { data: activeMatch } = useQuery({
    queryKey: ["active-match"],
    queryFn: () => api.get("/game/active-match", token),
    refetchInterval: dismissedMatchIds.size > 0 ? false : 10000,
  });

  const { data: platformStatus } = useQuery({
    queryKey: ["platform-status"],
    queryFn: () => api.get("/game/platform-status"),
    refetchInterval: 15000,
  });

  const maintenanceMode = platformStatus?.maintenanceMode || false;
  const disabledGames: string[] = platformStatus?.disabledGames || [];

  // Only show banner if match exists AND hasn't been dismissed
  const showRejoinBanner = activeMatch && activeMatch.matchId && !dismissedMatchIds.has(activeMatch.matchId);

  const dismissRejoin = async () => {
    if (activeMatch?.matchId) {
      // Immediately hide the banner by adding to dismissed set
      setDismissedMatchIds(prev => new Set(prev).add(activeMatch.matchId));
      // Clear the cache
      queryClient.setQueryData(["active-match"], null);
      // Forfeit the match server-side so it becomes FINISHED
      try {
        await api.post(`/game/forfeit/${activeMatch.matchId}`, {}, token);
      } catch (e) {
        // Ignore errors (match may already be finished)
      }
    }
  };

  // Validate the match is still ACTIVE before rejoining
  const handleRejoin = async () => {
    if (!activeMatch?.matchId || rejoinStatus === "checking") return;
    setRejoinStatus("checking");
    try {
      // Re-fetch the latest match state from the server
      const latest = await api.get("/game/active-match", token);
      if (!latest || !latest.matchId) {
        // Match is finished — show expired state
        setRejoinStatus("expired");
        queryClient.setQueryData(["active-match"], null);
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          setDismissedMatchIds(prev => new Set(prev).add(activeMatch.matchId));
          setRejoinStatus("idle");
        }, 4000);
        return;
      }
    } catch {
      // API error — treat as expired to be safe
      setRejoinStatus("expired");
      queryClient.setQueryData(["active-match"], null);
      setTimeout(() => {
        setDismissedMatchIds(prev => new Set(prev).add(activeMatch.matchId));
        setRejoinStatus("idle");
      }, 4000);
      return;
    }
    // Match is still active — navigate in
    setRejoinStatus("idle");
    navigate(gameRoutes[activeMatch.gameType] || "/play/rps", { state: { rejoin: activeMatch } });
  };


  const { data: unreadData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications", token),
    refetchInterval: 30000,
  });
  const unreadCount = unreadData ? unreadData.filter((n: any) => !n.read).length : 0;

  if (balanceLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

      return (
        <div className="px-4 pt-6 pb-20">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex items-center justify-between mb-6"
          >
            <div className="flex items-center gap-3">
              <Link to="/profile">
                {avatarUrl ? (
                  <motion.img
                    src={avatarUrl}
                    alt={username}
                    whileHover={{ scale: 1.05 }}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/30 shadow-md"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-display font-extrabold text-primary-foreground shadow-md">
                    {username[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <div>
                <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="text-muted-foreground text-xs font-body uppercase tracking-widest">
                  {t("home.welcomeBack")}
                </motion.p>
                <motion.h1 initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="text-xl font-display font-bold text-foreground">
                  {username}
                </motion.h1>
              </div>
            </div>
            <Link to="/notifications" className="relative group">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border/50 group-hover:bg-muted/80">
                <Bell className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </motion.div>
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-primary badge-pulse" />
                </>
              )}
            </Link>
          </motion.div>

      {/* Rejoin Active Match Banner */}
      {showRejoinBanner && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mb-4 rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-4 relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-amber-500/5"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center"
              >
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </motion.div>
              <div>
                <p className="text-sm font-display font-bold text-foreground">{t("home.activeMatchFound")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("home.ongoingMatch", { gameType: activeMatch.gameType })} <span className="font-bold text-foreground">{activeMatch.opponentName}</span>
                </p>
              </div>
              <span className="text-2xl ml-auto">{gameEmojis[activeMatch.gameType] || "🎮"}</span>
            </div>
            <div className="flex gap-2">
              {rejoinStatus === "expired" ? (
                <div className="flex-1 py-2.5 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive font-display font-bold text-sm text-center">
                  {t("home.tooLateMatchOver")}
                </div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRejoin}
                  disabled={rejoinStatus === "checking"}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-display font-bold text-sm shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {rejoinStatus === "checking" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t("home.checking")}</>
                  ) : t("home.rejoinGame")}
                </motion.button>
              )}
              {rejoinStatus !== "expired" && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={dismissRejoin}
                  className="px-4 py-2.5 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border"
                >
                  {t("home.decline")}
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Balance Card */}
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 200 }}>
        <Link to="/wallet" className="block">
          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="glass-card rounded-2xl p-5 mb-6 relative overflow-hidden group border border-primary/20 bg-primary/5">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center gap-1.5">
                 <Zap className="w-3 h-3 text-primary" /> {t("home.availableFunds")}
              </p>
              <motion.h2 className="text-4xl font-display font-extrabold text-white mb-4" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                 {Number(balance?.total || balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
              </motion.h2>
              <div className="flex gap-4">
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground/80">{statsData?.wins || 0} {t("home.wins")}</span>
                </motion.div>
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <span className="text-xs font-semibold text-foreground/80">{statsData?.winRate || 0}% {t("home.winRate")}</span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </Link>
      </motion.div>

      {/* Games */}
      {maintenanceMode ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-2 mb-8">
          <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-8 text-center">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-4"
            >
              <Wrench className="w-8 h-8 text-amber-500" />
            </motion.div>
            <h3 className="text-lg font-display font-bold text-foreground mb-2">{t("home.underMaintenance")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {t("home.maintenanceDesc")}
            </p>
            <motion.div
              className="mt-4 flex items-center justify-center gap-2"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs text-amber-500 font-display font-bold uppercase tracking-widest">{t("home.updating")}</span>
              <div className="w-2 h-2 rounded-full bg-amber-500" />
            </motion.div>
          </div>
        </motion.div>
      ) : (
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <motion.div variants={staggerItem} className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-bold text-foreground uppercase tracking-widest">{t("home.availableGames")}</h3>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent uppercase tracking-tighter bg-accent/10 px-2 py-0.5 rounded-full">
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            </motion.div>
            <span>{t("home.liveMultiplayer")}</span>
          </div>
        </motion.div>
        <div className="space-y-3">
          {games.map((game, i) => {
            const gameTypeMap: Record<string, string> = { rps: 'RPS', bingo: 'BINGO', guess: 'GUESS', dice: 'DICE' };
            const isDisabled = disabledGames.includes(gameTypeMap[game.id] || '');
            return (
              <motion.div key={game.id} variants={staggerItem} custom={i}>
                <GameCard game={{ ...game, disabled: isDisabled }} />
              </motion.div>
            );
          })}
        </div>
      </motion.div>
      )}

      {/* Leaderboard Teaser */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, type: "spring" }} className="mt-8 mb-4">
        <Link to="/leaderboard">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="card-game rounded-2xl p-4 flex items-center justify-between border border-border/50 group">
            <div className="flex items-center gap-3">
              <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="w-11 h-11 rounded-xl bg-orange-400/20 flex items-center justify-center shadow-inner">
                <Trophy className="w-6 h-6 text-orange-400" />
              </motion.div>
              <div>
                <p className="text-sm font-display font-bold text-foreground">{t("home.globalLeaderboard")}</p>
                <p className="text-xs text-muted-foreground">{t("home.checkRanking")}</p>
              </div>
            </div>
            <motion.div animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </motion.div>
          </motion.div>
        </Link>
      </motion.div>
    </div>
  );
};

export default Index;
