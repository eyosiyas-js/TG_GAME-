import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Smartphone, CheckCircle2, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import MaintenanceOverlay from "@/components/MaintenanceOverlay";

const WithdrawPage = () => {
  const { t } = useTranslation();

  const { data: platformStatus } = useQuery({
    queryKey: ["platform-status"],
    queryFn: () => api.get("/game/platform-status"),
  });
  const maintenanceMode = platformStatus?.maintenanceMode || false;

  const withdrawMethods = [
    // { id: "cbebirr", label: "CBE Birr", icon: Smartphone, desc: t("withdraw.withdrawViaCbeBirr") },
    { id: "telebirr", label: "Telebirr", icon: Smartphone, desc: t("withdraw.withdrawViaTelebirr") },
  ];

  const [method, setMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [userPhone, setUserPhone] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: balance = 0 } = useQuery({
    queryKey: ["wallet-withdrawable"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/withdrawable", token);
    },
  });

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.phoneNumber) setUserPhone(parsed.phoneNumber);
      } catch {}
    }
  }, []);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (num > 0 && num <= Number(balance) && method) {
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token found");
        await api.post("/wallet/withdraw", { amount: num, method }, token);
        setSubmitted(true);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  if (submitted) {
    return (
      <div className="px-4 pt-6 min-h-screen flex flex-col items-center justify-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="text-center">
          <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </motion.div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">{t("withdraw.withdrawalRequested")}</h2>
          <p className="text-sm text-muted-foreground mb-1">{t("withdraw.amountLabel")} {amount} ETB</p>
          <p className="text-xs text-muted-foreground mb-6">{t("withdraw.pendingApproval")}</p>
          <Link to="/wallet" className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm inline-block">
            {t("withdraw.backToWallet")}
          </Link>
        </motion.div>
      </div>
    );
  }

  if (maintenanceMode) return <MaintenanceOverlay />;

  return (
    <div className="px-4 pt-6 pb-24">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 mb-6">
        <Link to="/wallet" className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
        </Link>
        <h1 className="text-xl font-display font-bold text-foreground">{t("withdraw.title")}</h1>
      </motion.div>

      {/* Balance */}
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card-game rounded-xl p-4 mb-6 text-center">
        <p className="text-xs text-muted-foreground">{t("withdraw.availableBalance")}</p>
        <p className="text-2xl font-display font-extrabold text-foreground">{(Number(balance) || 0).toLocaleString()} ETB</p>
      </motion.div>

      {/* Amount */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("withdraw.amount")}</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-display font-bold">ETB</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            max={balance}
            className="w-full h-14 pl-12 pr-4 rounded-xl bg-muted border border-border text-foreground font-display font-bold text-xl outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        {parseFloat(amount) > balance && (
          <div className="flex items-center gap-1.5 mt-2 text-destructive text-xs">
            <AlertTriangle className="w-3 h-3" />
            <span>{t("withdraw.exceedsBalance")}</span>
          </div>
        )}
        {amount && parseFloat(amount) < 20 && (
          <div className="flex items-center gap-1.5 mt-2 text-destructive text-xs">
            <AlertTriangle className="w-3 h-3" />
            <span>Minimum withdrawal is 20 ETB</span>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          {[100, 500, 1000].map(a => (
            <motion.button key={a} whileTap={{ scale: 0.95 }} onClick={() => setAmount(String(Math.min(a, Number(balance))))} className="flex-1 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-xs border border-border hover:border-primary/50 transition-colors">
              {a} ETB
            </motion.button>
          ))}
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setAmount(String(balance))} className="flex-1 py-2 rounded-lg bg-primary/20 text-primary font-display font-bold text-xs border border-primary/30">
            {t("common.max")}
          </motion.button>
        </div>
      </motion.div>

      {/* Method */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("withdraw.withdrawalMethod")}</label>
        <div className="space-y-2">
          {withdrawMethods.map(pm => (
            <motion.button
              key={pm.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMethod(pm.id)}
              className={`w-full card-game rounded-xl p-3.5 flex items-center gap-3 transition-all ${method === pm.id ? "ring-2 ring-primary" : ""}`}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <pm.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-display font-semibold text-foreground">{pm.label}</p>
                <p className="text-xs text-muted-foreground">{pm.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Phone Number (read-only) */}
      <AnimatePresence>
        {method && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
            <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              {t("withdraw.phoneNumber")}
            </label>
            <input
              value={userPhone}
              readOnly
              className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-border text-foreground font-display font-semibold text-sm outline-none cursor-not-allowed opacity-80"
            />
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3" />
              <span>{t("withdraw.phoneNote")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setShowConfirm(true)}
        disabled={!amount || !method || parseFloat(amount) > balance || parseFloat(amount) < 20}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary disabled:opacity-50 disabled:shadow-none"
      >
        {t("withdraw.requestWithdrawal")}
      </motion.button>
      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="card-game rounded-2xl p-6 max-w-sm w-full text-center relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 hover:scale-105 transition-transform cursor-default">
                <AlertCircle className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground mb-2">{t("withdraw.confirmWithdrawal")}</h3>
              <p className="text-sm text-muted-foreground mb-6">{t("withdraw.confirmWithdrawalMsg")} <strong className="text-foreground text-base">{amount} ETB</strong> {t("withdraw.confirmWithdrawalMsgEnd") || "?"}</p>
              
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border hover:bg-muted/80 transition-colors"
                >
                  {t("withdraw.noCancel")}
                </button>
                <button 
                  onClick={() => {
                    setShowConfirm(false);
                    handleSubmit();
                  }}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm glow-primary hover:opacity-90 transition-opacity"
                >
                  {t("withdraw.yesProceed")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WithdrawPage;
