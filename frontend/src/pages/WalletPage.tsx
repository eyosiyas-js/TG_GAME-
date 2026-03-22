import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Clock, Plus, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

const WalletPage = () => {
  const { data: balance, isLoading } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/balance", token);
    },
  });

  const { data: transactionsData, isLoading: isTxLoading } = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/transactions", token);
    },
  });

  const [activeTab, setActiveTab] = useState<"all" | "deposits" | "withdrawals">("all");
  
  const transactions = (transactionsData || []).map((tx: any) => ({
    id: tx.id,
    amount: Number(tx.amount),
    label: tx.type,
    time: new Date(tx.createdAt).toLocaleString(),
    type: tx.type,
  }));

  const filtered = transactions.filter((t: any) => {
    if (activeTab === "deposits") return t.amount > 0;
    if (activeTab === "withdrawals") return t.amount < 0;
    return true;
  });

  return (
    <div className="px-4 pt-6">
      <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xl font-display font-bold text-foreground mb-6">
        Wallet
      </motion.h1>

      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="glass-card rounded-2xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/15 via-transparent to-primary/10" />
        <div className="relative z-10">
          <p className="text-muted-foreground text-xs font-body mb-1">Available Balance</p>
          <h2 className="text-4xl font-display font-extrabold text-foreground mb-4">
            {isLoading ? "..." : `$${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </h2>
          <div className="flex gap-3">
            <Link to="/deposit" className="flex-1">
              <motion.div whileTap={{ scale: 0.95 }} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm">
                <Plus className="w-4 h-4" />
                Deposit
              </motion.div>
            </Link>
            <Link to="/withdraw" className="flex-1">
              <motion.div whileTap={{ scale: 0.95 }} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border">
                <Minus className="w-4 h-4" />
                Withdraw
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-2 mb-4">
        {(["all", "deposits", "withdrawals"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-xs font-display font-semibold capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {tab}
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
              <p className="text-sm font-display font-semibold text-foreground">{tx.label}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{tx.time}</span>
              </div>
            </div>
            <p className={`text-sm font-display font-bold ${tx.amount > 0 ? "text-primary" : "text-destructive"}`}>
              {tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount)}
            </p>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default WalletPage;
