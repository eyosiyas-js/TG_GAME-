import { motion } from "framer-motion";
import { Trophy, TrendingUp, Settings, ChevronRight, Star, Target, Loader2, Camera } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3005';

const Profile = () => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token") || "";
  const username = localStorage.getItem("username") || "Player";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: statsData, isLoading } = useQuery({
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/^image\/(jpg|jpeg|png|gif|webp)$/)) {
      toast.error("Please select a valid image file (JPG, PNG, GIF, or WebP)");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const result = await api.post("/auth/avatar", formData, token);

      // Update localStorage with new avatar
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        user.avatar = result.avatar;
        localStorage.setItem("user", JSON.stringify(user));
      }

      // Invalidate queries to refresh avatar everywhere
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });

      toast.success("Profile picture updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload avatar");
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = [
    { label: t("profile.winsLabel"), value: statsData?.wins || 0, icon: Trophy, color: "text-primary" },
    { label: t("profile.levelLabel"), value: profileData?.level || 1, icon: Star, color: "text-accent" },
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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleAvatarUpload}
          className="hidden"
        />

        {/* Avatar with camera overlay */}
        <motion.button
          onClick={handleAvatarClick}
          disabled={uploading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-24 h-24 rounded-full mb-3 group cursor-pointer"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              className="w-24 h-24 rounded-full object-cover shadow-xl ring-2 ring-primary/30"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-display font-extrabold text-primary-foreground shadow-xl">
              {username[0]?.toUpperCase()}
            </div>
          )}

          {/* Camera overlay */}
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {uploading ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <Camera className="w-6 h-6 text-white" />
            )}
          </div>

          {/* Always-visible camera badge */}
          <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-lg">
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5 text-primary-foreground" />
            )}
          </div>
        </motion.button>

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
        className="grid grid-cols-3 gap-2 mb-8"
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

      {/* Referral Link Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <h3 className="text-sm font-display font-bold text-foreground mb-3">Invite Friends & Earn</h3>
        <div className="card-game rounded-xl p-4 border border-primary/20 bg-primary/5">
          <p className="text-xs text-muted-foreground mb-3">
            Share your link and get 10 ETB for every friend who joins and plays(up to 5 friends).
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-xs font-mono truncate overflow-hidden">
              {`https://t.me/habtbetbot?start=${username}`}
            </div>
            <button
              onClick={() => {
                const link = `https://t.me/habtbetbot?start=${username}`;
                navigator.clipboard.writeText(link);
                toast.success("Link copied!");
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
            >
              Copy
            </button>
          </div>
          {profileData?.isInfluencer && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-accent font-bold uppercase tracking-widest">
              <Star className="w-3 h-3" /> Influencer Account (Unlimited Bonuses)
            </div>
          )}
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
