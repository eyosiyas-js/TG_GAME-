import { motion } from "framer-motion";
import { ArrowLeft, User, Lock, Bell, Shield, LogOut, ChevronRight, X, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const SettingsPage = () => {
  const [notifications, setNotifications] = useState(true);
  const navigate = useNavigate();

  const [username, setUsername] = useState(localStorage.getItem("username") || "");

  const [showUserModal, setShowUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<"available" | "taken" | "">("");

  useEffect(() => {
    if (newUsername.length < 3) {
      setUsernameAvailability("");
      return;
    }
    
    if (newUsername.toLowerCase() === username.toLowerCase()) {
      setUsernameAvailability("");
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const token = localStorage.getItem("token") || "";
        await api.get(`/wallet/user-preview/${newUsername}`, token);
        setUsernameAvailability("taken");
      } catch (err: any) {
        setUsernameAvailability("available");
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [newUsername, username]);

  const [showPassModal, setShowPassModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  const handleUpdateUsername = async () => {
    if (newUsername.length < 3) return toast.error("Username must be at least 3 characters");
    setIsUpdatingUser(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await api.put("/auth/change-username", { newUsername }, token);
      localStorage.setItem("token", res.access_token);
      localStorage.setItem("username", res.user.username);
      setUsername(res.user.username);
      toast.success("Username updated successfully!");
      setShowUserModal(false);
      setNewUsername("");
      setUsernameAvailability("");
    } catch (e: any) {
      toast.error(e.message || "Failed to update username");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setIsUpdatingPass(true);
    try {
      const token = localStorage.getItem("token") || "";
      await api.put("/auth/change-password", { currentPassword, newPassword }, token);
      toast.success("Password updated successfully!");
      setShowPassModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error(e.message || "Failed to update password");
    } finally {
      setIsUpdatingPass(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    navigate("/auth");
  };

  const sections = [
    {
      title: "Account",
      items: [
        { icon: User, label: "Change Username", desc: username, onClick: () => setShowUserModal(true) },
        { icon: Lock, label: "Change Password", desc: "Change your account password", onClick: () => setShowPassModal(true) },
      ],
    },
    {
      title: "Preferences",
      items: [
        { icon: Bell, label: "Notifications", desc: notifications ? "Enabled" : "Disabled", toggle: true },
      ],
    },
    {
      title: "Security",
      items: [
        { icon: Shield, label: "Two-Factor Auth", desc: "Not enabled" },
      ],
    },
  ];

  return (
    <div className="px-4 pt-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 mb-6">
        <Link to="/profile" className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
        </Link>
        <h1 className="text-xl font-display font-bold text-foreground">Settings</h1>
      </motion.div>

      {sections.map((section, i) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="mb-6"
        >
          <h3 className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {section.title}
          </h3>
          <div className="space-y-1">
            {section.items.map((itm) => (
              <button
                key={itm.label}
                onClick={(itm as any).onClick ? (itm as any).onClick : () => {
                  if (itm.toggle) setNotifications(!notifications);
                }}
                className="w-full card-game rounded-xl p-3.5 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <itm.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-display font-semibold text-foreground">{itm.label}</p>
                  <p className="text-xs text-muted-foreground">{itm.desc}</p>
                </div>
                {itm.toggle ? (
                  <div
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                      notifications ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-foreground transition-transform ${
                        notifications ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </div>
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </motion.div>
      ))}

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        onClick={handleLogout}
        className="w-full card-game rounded-xl p-3.5 flex items-center gap-3 mt-4"
      >
        <div className="w-9 h-9 rounded-lg bg-destructive/20 flex items-center justify-center">
          <LogOut className="w-4 h-4 text-destructive" />
        </div>
        <span className="text-sm font-display font-semibold text-destructive">Log Out</span>
      </motion.button>

      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-sm bg-card border border-border p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold">Change Username</h2>
              <button onClick={() => { setShowUserModal(false); setNewUsername(""); setUsernameAvailability(""); }} className="p-1 rounded-md text-muted-foreground hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">New Username</label>
                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full bg-muted border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Enter new username..." />
                
                {newUsername.length >= 3 && newUsername.toLowerCase() !== username.toLowerCase() && (
                  <div className="mt-2 text-xs font-semibold">
                    {isCheckingUsername ? (
                      <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking availability...</span>
                    ) : usernameAvailability === "taken" ? (
                      <span className="text-destructive">Username already taken</span>
                    ) : usernameAvailability === "available" ? (
                      <span className="text-green-500">Username available!</span>
                    ) : null}
                  </div>
                )}
              </div>
              <button disabled={isUpdatingUser || isCheckingUsername || usernameAvailability === "taken" || newUsername.length < 3} onClick={handleUpdateUsername} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl flex items-center justify-center disabled:opacity-50 transition-opacity">
                {isUpdatingUser ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Username"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-sm bg-card border border-border p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold">Change Password</h2>
              <button onClick={() => setShowPassModal(false)} className="p-1 rounded-md text-muted-foreground hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Current Password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full bg-muted border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Enter current password..." />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-muted border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Enter new password..." />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-muted border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Confirm new password..." />
              </div>
              <button disabled={isUpdatingPass} onClick={handleUpdatePassword} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl flex items-center justify-center disabled:opacity-50 transition-opacity">
                {isUpdatingPass ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
