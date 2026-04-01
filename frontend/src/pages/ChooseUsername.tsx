import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Gamepad2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { sounds } from "@/components/game/AnimationEffects";
import { useTranslation } from "react-i18next";

const ChooseUsername = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const token = localStorage.getItem("token");

  // If no token, redirect to auth
  if (!token) {
    navigate("/auth");
    return null;
  }

  // If username already set, redirect home
  const existingUsername = localStorage.getItem("username");
  if (existingUsername) {
    navigate("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.select();
    setLoading(true);
    setMessage(null);

    try {
      const response = await api.post("/auth/set-username", { username }, token);
      localStorage.setItem("username", response.user.username);
      localStorage.setItem("user", JSON.stringify(response.user));
      localStorage.setItem("token", response.access_token);
      sounds.win();
      navigate("/");
    } catch (err: any) {
      setMessage(err.message);
      sounds.lose?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-64 h-64 rounded-full bg-primary/5 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity }}
          style={{ top: "10%", left: "-10%" }}
        />
        <motion.div
          className="absolute w-48 h-48 rounded-full bg-secondary/5 blur-3xl"
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity }}
          style={{ bottom: "20%", right: "-5%" }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col px-6 pt-8 pb-6 max-w-sm mx-auto w-full justify-center">
        {/* Logo & Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="text-center mb-8"
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4"
          >
            <img src="/logo.png" alt="Habt Bet Logo" className="w-full h-full object-contain" />
          </motion.div>
          <h1 className="text-2xl font-display font-extrabold text-foreground">
            {t("chooseUsername.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("chooseUsername.subtitle")}
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
              {t("chooseUsername.username")}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("chooseUsername.placeholder")}
                required
                minLength={3}
                autoFocus
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-muted border border-border text-foreground font-body text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-3 rounded-xl bg-destructive/20 border border-destructive/30"
              >
                <p className="text-xs text-destructive font-display font-semibold">{message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            type="submit"
            disabled={loading || username.length < 3}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-base glow-primary disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
              />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t("chooseUsername.letsGo")}
              </>
            )}
          </motion.button>
        </motion.form>
      </div>
    </div>
  );
};

export default ChooseUsername;
