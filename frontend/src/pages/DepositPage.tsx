import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CreditCard, Smartphone, Building2, Upload, Copy, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "@/lib/api";

const paymentMethods = [
  { id: "card", label: "Card Payment", icon: CreditCard, desc: "Visa, Mastercard, etc." },
  { id: "mobile", label: "Mobile Money", icon: Smartphone, desc: "M-Pesa, Airtel Money" },
  { id: "bank", label: "Bank Transfer", icon: Building2, desc: "Direct bank transfer" },
];

const DepositPage = () => {
  const [method, setMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReceipt(file.name);
  };

  const handleSubmit = async () => {
    if (amount && method && paymentId) {
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token found");
        await api.post("/wallet/deposit", { amount: Number(amount) }, token);
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
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Deposit Submitted!</h2>
          <p className="text-sm text-muted-foreground mb-1">Amount: ${amount}</p>
          <p className="text-xs text-muted-foreground mb-6">Your deposit is being verified. This usually takes 1-5 minutes.</p>
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
        <h1 className="text-xl font-display font-bold text-foreground">Deposit</h1>
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
            className="w-full h-14 pl-8 pr-4 rounded-xl bg-muted border border-border text-foreground font-display font-bold text-xl outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {[50, 100, 500, 1000].map(a => (
            <motion.button key={a} whileTap={{ scale: 0.95 }} onClick={() => setAmount(String(a))} className="flex-1 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-xs border border-border hover:border-primary/50 transition-colors">
              ${a}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Payment Method */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Payment Method</label>
        <div className="space-y-2">
          {paymentMethods.map(pm => (
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

      {/* Instructions */}
      <AnimatePresence>
        {method && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
            <div className="card-game rounded-xl p-4 space-y-3">
              <p className="text-xs font-display font-bold text-muted-foreground uppercase">Instructions</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>1. Send payment of <span className="text-foreground font-semibold">${amount || "0"}</span> to:</p>
                <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
                  <span className="font-display font-bold text-foreground text-sm">
                    {method === "card" ? "4242 •••• •••• 1234" : method === "mobile" ? "+1 234 567 8900" : "ACC: 12345678"}
                  </span>
                  <Copy className="w-4 h-4 text-muted-foreground cursor-pointer" />
                </div>
                <p>2. Enter the payment/transaction ID below</p>
                <p>3. Upload a receipt screenshot for faster verification</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment ID */}
      {method && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Payment / Transaction ID</label>
          <input
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder="Enter payment reference..."
            className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-foreground font-display font-semibold text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </motion.div>
      )}

      {/* Receipt Upload */}
      {method && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Receipt (Optional)</label>
          <label className="card-game rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed border-border hover:border-primary/50 transition-colors">
            <Upload className="w-6 h-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{receipt || "Tap to upload receipt"}</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        </motion.div>
      )}

      {/* Submit */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={!amount || !method || !paymentId}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary disabled:opacity-50 disabled:shadow-none"
      >
        Submit Deposit
      </motion.button>
    </div>
  );
};

export default DepositPage;
