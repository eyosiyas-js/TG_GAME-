import { motion } from "framer-motion";
import { Trophy, TrendingUp, Settings, ChevronRight, Star, Target, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

const Profile = () => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token") || "";
  const username = localStorage.getItem("username") || "Player";

  const { data: statsData, isLoading } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => api.get("/game/stats", token),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = [
    { label: t("profile.gamesLabel"), value: statsData?.totalMatches || 0, icon: () => <img src="/logo.png" className="w-4 h-4 object-contain brightness-0 invert opacity-70" alt="Games" />, color: "text-secondary" },
    { label: t("profile.winsLabel"), value: statsData?.wins || 0, icon: Trophy, color: "text-primary" },
    { label: t("profile.winRateLabel"), value: `${statsData?.winRate || 0}%`, icon: TrendingUp, color: "text-accent" },
    { label: t("profile.streakLabel"), value: statsData?.streak || 0, icon: Target, color: "text-primary" },
  ];

  const recentAchievements = [
    { label: t("profile.earlyAdopter"), emoji: "🚀" },
    { label: t("profile.firstStake"), emoji: "💎" },
    { label: t("profile.winnerCircle"), emoji: "🏆" },
  ];

  return (
    <div className="px-4 pt-6 pb-20">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between mb-6"
      >
        <h1 className="text-xl font-display font-bold text-foreground">{t("profile.title")}</h1>
        <Link to="/settings" className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <Settings className="w-4.5 h-4.5 text-muted-foreground" />
        </Link>
      </motion.div>

      {/* Avatar & Name */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center mb-8"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-display font-extrabold text-primary-foreground mb-3 shadow-xl">
          {username[0]?.toUpperCase()}
        </div>
        <h2 className="text-lg font-display font-bold text-foreground">{username}</h2>
        <div className="flex items-center gap-1 mt-1">
          <Star className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-accent font-display font-semibold">{t("profile.livePlayer")}</span>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-4 gap-2 mb-8"
      >
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-game rounded-xl p-3 flex flex-col items-center gap-1 border border-border/50 shadow-sm">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-lg font-display font-extrabold text-foreground">{value}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">{label}</span>
          </div>
        ))}
      </motion.div>

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mb-8"
      >
        <h3 className="text-sm font-display font-bold text-foreground mb-3">{t("profile.milestones")}</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {recentAchievements.map((a) => (
            <div
              key={a.label}
              className="shrink-0 glass-card rounded-xl px-4 py-3 flex items-center gap-2 border border-border/30 hover:bg-white/5 transition-colors"
            >
              <span className="text-xl">{a.emoji}</span>
              <span className="text-xs font-display font-semibold text-foreground whitespace-nowrap">{a.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="space-y-2"
      >
        {[
          { label: t("profile.myMatchHistory"), to: "/games" },
          { label: t("profile.leaderboardStandings"), to: "/leaderboard" },
          { label: t("profile.accountSettings"), to: "/settings" },
        ].map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className="card-game rounded-xl p-3.5 flex items-center justify-between border border-border/50 hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm font-display font-semibold text-foreground">{link.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}
      </motion.div>
    </div>
  );
};

export default Profile;
