import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Lock, Eye, EyeOff, Gamepad2 } from "lucide-react";
import { api } from "@/lib/api";
import { sounds } from "@/components/game/AnimationEffects";

type AuthMode = "login" | "signup" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sounds.select();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "login") {
        const response = await api.post("/auth/login", { phoneNumber, password });
        localStorage.setItem("token", response.access_token);
        localStorage.setItem("user", JSON.stringify(response.user));
        localStorage.setItem("userId", response.user.id);
        if (response.user.phoneNumber) {
          localStorage.setItem("phoneNumber", response.user.phoneNumber);
        }
        sounds.win();

        if (response.user.username) {
          localStorage.setItem("username", response.user.username);
          navigate("/");
        } else {
          navigate("/choose-username");
        }
      } else if (mode === "signup") {
        const response = await api.post("/auth/register", { phoneNumber, password });
        localStorage.setItem("token", response.access_token);
        localStorage.setItem("user", JSON.stringify(response.user));
        localStorage.setItem("userId", response.user.id);
        if (response.user.phoneNumber) {
          localStorage.setItem("phoneNumber", response.user.phoneNumber);
        }
        sounds.win();
        navigate("/choose-username");
      } else if (mode === "forgot") {
        setTimeout(() => {
          setLoading(false);
          setMessage("Password reset functionality is not implemented yet.");
        }, 1000);
      }
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

      <div className="relative z-10 flex-1 flex flex-col px-6 pt-8 pb-6 max-w-sm mx-auto w-full">
        {/* Back button for forgot password */}
        {mode === "forgot" && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => setMode("login")}
            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center mb-4 self-start"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
          </motion.button>
        )}

        {/* Logo & Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="text-center mb-8 mt-8"
        >
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-4"
          >
            <Gamepad2 className="w-8 h-8 text-primary-foreground" />
          </motion.div>
          <h1 className="text-2xl font-display font-extrabold text-foreground">
            {mode === "login" ? "Welcome Back" : mode === "signup" ? "Join the Game" : "Reset Password"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login"
              ? "Sign in to continue playing"
              : mode === "signup"
              ? "Create your account and start winning"
              : "We'll send you a reset link"}
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          key={mode}
          initial={{ opacity: 0, x: mode === "signup" ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          onSubmit={handleSubmit}
          className="space-y-4 flex-1"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter your phone number"
                required
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-muted border border-border text-foreground font-body text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full h-12 pl-10 pr-12 rounded-xl bg-muted border border-border text-foreground font-body text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="text-xs text-primary font-display font-semibold"
            >
              Forgot password?
            </button>
          )}

          {/* Error/Info Message */}
          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-3 rounded-xl bg-primary/20 border border-primary/30"
              >
                <p className="text-xs text-primary font-display font-semibold">{message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-base glow-primary disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
              />
            ) : (
              mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"
            )}
          </motion.button>
        </motion.form>

        {/* Toggle mode */}
        {mode !== "forgot" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mt-6"
          >
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}
                className="text-primary font-display font-bold"
              >
                {mode === "login" ? "Sign Up" : "Sign In"}
              </button>
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Auth;
