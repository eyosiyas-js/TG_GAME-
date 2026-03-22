import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CreditCard, Smartphone, Building2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const withdrawMethods = [
  { id: "card", label: "Card Withdrawal", icon: CreditCard, desc: "Visa, Mastercard" },
  { id: "mobile", label: "Mobile Money", icon: Smartphone, desc: "M-Pesa, Airtel Money" },
  { id: "bank", label: "Bank Transfer", icon: Building2, desc: "Direct to bank account" },
];

const WithdrawPage = () => {
  const [method, setMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [accountInfo, setAccountInfo] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: balance = 0, isLoading } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");
      return api.get("/wallet/balance", token);
    },
  });

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (num > 0 && num <= Number(balance) && method && accountInfo) {
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token found");
        await api.post("/wallet/withdraw", { amount: num }, token);
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
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Withdrawal Requested!</h2>
          <p className="text-sm text-muted-foreground mb-1">Amount: ${amount}</p>
          <p className="text-xs text-muted-foreground mb-6">Processing typically takes 1-24 hours.</p>
          <Link to="/wallet" className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm inline-block">
            Back to Wallet
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 mb-6">
        <Link to="/wallet" className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4.5 h-4.5 text-muted-foreground" />
        </Link>
        <h1 className="text-xl font-display font-bold text-foreground">Withdraw</h1>
      </motion.div>

      {/* Balance */}
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card-game rounded-xl p-4 mb-6 text-center">
        <p className="text-xs text-muted-foreground">Available Balance</p>
        <p className="text-2xl font-display font-extrabold text-foreground">${balance.toLocaleString()}</p>
      </motion.div>

      {/* Amount */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Amount</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-display font-bold">$</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            max={balance}
            className="w-full h-14 pl-8 pr-4 rounded-xl bg-muted border border-border text-foreground font-display font-bold text-xl outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        {parseFloat(amount) > balance && (
          <div className="flex items-center gap-1.5 mt-2 text-destructive text-xs">
            <AlertTriangle className="w-3 h-3" />
            <span>Exceeds available balance</span>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          {[100, 500, 1000].map(a => (
            <motion.button key={a} whileTap={{ scale: 0.95 }} onClick={() => setAmount(String(Math.min(a, balance)))} className="flex-1 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-xs border border-border hover:border-primary/50 transition-colors">
              ${a}
            </motion.button>
          ))}
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setAmount(String(balance))} className="flex-1 py-2 rounded-lg bg-primary/20 text-primary font-display font-bold text-xs border border-primary/30">
            Max
          </motion.button>
        </div>
      </motion.div>

      {/* Method */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Withdrawal Method</label>
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

      {/* Account Info */}
      <AnimatePresence>
        {method && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
            <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              {method === "mobile" ? "Phone Number" : method === "card" ? "Card Number" : "Account Number"}
            </label>
            <input
              value={accountInfo}
              onChange={(e) => setAccountInfo(e.target.value)}
              placeholder={method === "mobile" ? "+1 234 567 8900" : method === "card" ? "4242 •••• •••• ••••" : "Enter account number"}
              className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-foreground font-display font-semibold text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={!amount || !method || !accountInfo || parseFloat(amount) > balance}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary disabled:opacity-50 disabled:shadow-none"
      >
        Request Withdrawal
      </motion.button>
    </div>
  );
};

export default WithdrawPage;
