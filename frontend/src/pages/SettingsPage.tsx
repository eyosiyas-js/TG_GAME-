import { motion } from "framer-motion";
import { ArrowLeft, User, Lock, Bell, Shield, LogOut, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

const SettingsPage = () => {
  const [notifications, setNotifications] = useState(true);
  const navigate = useNavigate();

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
        { icon: User, label: "Change Username", desc: "Player_One" },
        { icon: Lock, label: "Change Password", desc: "Last changed 30 days ago" },
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
                onClick={() => {
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
    </div>
  );
};

export default SettingsPage;
