import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Clock, Plus, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { X, Loader2, Send, User } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const WalletPage = () => {
  const { t } = useTranslation();

  const { data: balance, isLoading, refetch: refetchBalance } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/balance", token);
    },
  });

  const { data: depositsData, isLoading: isDepositsLoading, refetch: refetchDeposits } = useQuery({
    queryKey: ["wallet-deposits"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/deposits", token);
    },
  });

  const { data: transactionsData, isLoading: isTxLoading, refetch: refetchTx } = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/transactions", token);
    },
  });

  const { data: withdrawalsData } = useQuery({
    queryKey: ["wallet-withdrawals"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/withdrawals", token);
    },
  });

  const [activeTab, setActiveTab] = useState<"all" | "deposits" | "withdrawals">("all");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [previewUser, setPreviewUser] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (transferTarget.length < 3) {
      setPreviewUser(null);
      setPreviewError("");
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      setPreviewError("");
      try {
        const token = localStorage.getItem("token") || "";
        const user = await api.get(`/wallet/user-preview/${transferTarget}`, token);
        setPreviewUser(user);
      } catch (err: any) {
        setPreviewUser(null);
        setPreviewError(t("wallet.userNotFound"));
      } finally {
        setIsPreviewLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [transferTarget, t]);

  const handleTransfer = async () => {
    if (!transferTarget || !transferAmount || Number(transferAmount) <= 0) return;
    setIsTransferring(true);
    try {
      const token = localStorage.getItem("token") || "";
      await api.post("/wallet/transfer", { targetUsername: transferTarget, amount: Number(transferAmount) }, token);
      toast.success(`Successfully sent ${transferAmount} ETB to ${transferTarget}`);
      setShowTransfer(false);
      setTransferTarget("");
      setTransferAmount("");
      setPreviewUser(null);
      setPreviewError("");
      refetchBalance();
      refetchTx();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };
  
  const rawTransactions = (transactionsData || []).map((tx: any) => ({
    id: tx.id,
    amount: Number(tx.amount),
    label: tx.type,
    time: new Date(tx.createdAt).toLocaleString(),
    timestamp: new Date(tx.createdAt).getTime(),
    type: tx.type,
    status: "SUCCESSFUL",
  }));

  const rawDeposits = (depositsData || []).map((d: any) => ({
    id: d.id,
    amount: Number(d.amount),
    label: t("wallet.depositRequest"),
    time: new Date(d.createdAt).toLocaleString(),
    timestamp: new Date(d.createdAt).getTime(),
    type: "DEPOSIT",
    status: d.status,
  }));

  // Merge deposits and transactions. If a deposit is approved, there is already a DEPOSIT transaction for it.
  // We only want to show PENDING or REJECTED deposits to avoid duplicates with the SUCCESSFUL transactions.
  const activeDeposits = rawDeposits.filter((d: any) => d.status !== "APPROVED");

  const rawWithdrawals = (withdrawalsData || []).map((w: any) => ({
    id: w.id,
    amount: -Number(w.amount),
    label: t("wallet.withdrawalRequest"),
    time: new Date(w.createdAt).toLocaleString(),
    timestamp: new Date(w.createdAt).getTime(),
    type: "WITHDRAW",
    status: w.status,
  }));

  const activeWithdrawals = rawWithdrawals.filter((w: any) => w.status !== "APPROVED");
  
  const allItems = [...rawTransactions, ...activeDeposits, ...activeWithdrawals].sort((a, b) => b.timestamp - a.timestamp);

  const filtered = allItems.filter((t: any) => {
    if (!["DEPOSIT", "WITHDRAW", "TRANSFER"].includes(t.type)) return false;
    if (activeTab === "deposits") return t.type === "DEPOSIT";
    if (activeTab === "withdrawals") return t.type === "WITHDRAW";
    return true;
  });

  const tabLabels: Record<string, string> = {
    all: t("wallet.all"),
    deposits: t("wallet.deposits"),
    withdrawals: t("wallet.withdrawals"),
  };

  return (
    <div className="px-4 pt-6">
      <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xl font-display font-bold text-foreground mb-6">
        {t("wallet.title")}
      </motion.h1>

      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="glass-card rounded-2xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/15 via-transparent to-primary/10" />
        <div className="relative z-10">
          <p className="text-muted-foreground text-xs font-body mb-1">{t("wallet.availableBalance")}</p>
          <h2 className="text-4xl font-display font-extrabold text-foreground mb-4">
            {isLoading ? "..." : `${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`}
          </h2>
          <div className="flex gap-2">
            <Link to="/deposit" className="flex-1">
              <motion.div whileTap={{ scale: 0.95 }} className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm">
                <Plus className="w-4 h-4" />
                {t("wallet.deposit")}
              </motion.div>
            </Link>
            <Link to="/withdraw" className="flex-1">
              <motion.div whileTap={{ scale: 0.95 }} className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border">
                <Minus className="w-4 h-4" />
                {t("wallet.withdraw")}
              </motion.div>
            </Link>
            <button onClick={() => setShowTransfer(true)} className="flex-1">
              <motion.div whileTap={{ scale: 0.95 }} className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-display font-bold text-sm border border-border">
                <Send className="w-4 h-4" />
                {t("wallet.transfer")}
              </motion.div>
            </button>
          </div>
        </div>
      </motion.div>

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-sm bg-card border border-border p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold">{t("wallet.transferFunds")}</h2>
              <button onClick={() => { setShowTransfer(false); setTransferTarget(""); setTransferAmount(""); setPreviewUser(null); setPreviewError(""); }} className="p-1 rounded-md text-muted-foreground hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">{t("wallet.recipientUsername")}</label>
                <input type="text" value={transferTarget} onChange={e => setTransferTarget(e.target.value)} className="w-full bg-muted border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={t("wallet.targetUsername")} />
                {transferTarget.length >= 3 && (
                  <div className="mt-2 h-14 flex items-center">
                    {isPreviewLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> {t("wallet.checkingUser")}
                      </div>
                    ) : previewError ? (
                      <div className="text-destructive text-sm font-semibold">{previewError}</div>
                    ) : previewUser ? (
                      <div className="flex items-center gap-3 bg-secondary/50 rounded-lg p-2 w-full border border-border">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                          {previewUser.avatar ? (
                            <img src={previewUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-display font-bold text-sm leading-tight text-foreground">{previewUser.username}</p>
                          <p className="text-xs text-muted-foreground font-semibold">{t("common.level")} {previewUser.level}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">{t("wallet.amountLabel")}</label>
                <input type="number" min="1" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} className="w-full bg-muted border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={t("wallet.amountToSend")} />
              </div>
              <button disabled={isTransferring || !!previewError || !previewUser} onClick={handleTransfer} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl flex items-center justify-center disabled:opacity-50 transition-opacity">
                {isTransferring ? <Loader2 className="w-5 h-5 animate-spin" /> : t("wallet.sendFunds")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(["all", "deposits", "withdrawals"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-xs font-display font-semibold capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-2">
        {filtered.map((tx) => (
          <div key={tx.id} className="card-game rounded-xl p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tx.amount > 0 ? "bg-primary/20" : "bg-destructive/20"}`}>
              {tx.amount > 0 ? <ArrowDownLeft className="w-4 h-4 text-primary" /> : <ArrowUpRight className="w-4 h-4 text-destructive" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-display font-semibold text-foreground">{tx.label}</p>
                {tx.status && tx.status !== "SUCCESSFUL" && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tx.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-destructive/20 text-destructive'}`}>
                    {tx.status}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{tx.time}</span>
              </div>
            </div>
            <p className={`text-sm font-display font-bold ${tx.amount > 0 ? "text-primary" : "text-destructive"}`}>
              {tx.amount > 0 ? "+" : ""}{Math.abs(tx.amount)} ETB
            </p>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default WalletPage;
