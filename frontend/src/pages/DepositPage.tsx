import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CreditCard, Smartphone, Building2, Upload, Copy, CheckCircle2, X, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

const DepositPage = () => {
  const { t } = useTranslation();

  const paymentMethods = [
    { id: "cbe", label: "CBE", icon: Building2, desc: "Commercial Bank of Ethiopia" },
    { id: "cbebirr", label: "CBE Birr", icon: Smartphone, desc: "CBE Mobile Money" },
    { id: "telebirr", label: "Telebirr", icon: Smartphone, desc: "Ethio Telecom Mobile Money" },
  ];

  const [method, setMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    api.get("/wallet/settings", token || undefined).then(data => setSettings(data)).catch(console.error);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReceipt(file);
  };

  const handleSubmit = async () => {
    if (amount && method && senderName && receipt) {
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token found");
        
        const formData = new FormData();
        formData.append("amount", amount);
        formData.append("method", method);
        formData.append("senderName", senderName);
        if (paymentId) formData.append("transactionId", paymentId);
        formData.append("receipt", receipt);

        await api.post("/wallet/deposit", formData, token);
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
          <h2 className="text-xl font-display font-bold text-foreground mb-2">{t("deposit.depositSubmitted")}</h2>
          <p className="text-sm text-muted-foreground mb-1">{t("deposit.amountLabel")} {amount} ETB</p>
          <p className="text-xs text-muted-foreground mb-6">{t("deposit.verifyingDeposit")}</p>
          <Link to="/wallet" className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm inline-block">
            {t("deposit.backToWallet")}
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
        <h1 className="text-xl font-display font-bold text-foreground">{t("deposit.title")}</h1>
      </motion.div>

      {/* Amount */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("deposit.amount")}</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-display font-bold">ETB</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-14 pl-12 pr-4 rounded-xl bg-muted border border-border text-foreground font-display font-bold text-xl outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {[50, 100, 500, 1000].map(a => (
            <motion.button key={a} whileTap={{ scale: 0.95 }} onClick={() => setAmount(String(a))} className="flex-1 py-2 rounded-lg bg-muted text-foreground font-display font-bold text-xs border border-border hover:border-primary/50 transition-colors">
              {a} ETB
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Payment Method */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("deposit.paymentMethod")}</label>
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
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden space-y-4">
            
            {/* Steps Section */}
            <div className="card-game rounded-xl p-4 space-y-4">
              <p className="text-xs font-display font-bold text-muted-foreground uppercase">{t("deposit.steps")}</p>
              <div className="space-y-4 text-xs text-muted-foreground">
                <p>{t("deposit.step1")} <span className="text-foreground font-semibold">{amount || "0"} ETB</span> {t("deposit.step1end")}</p>
                <div className="grid gap-2">
                  <div className="bg-muted rounded-lg p-3 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-foreground text-sm tracking-widest">
                        {method === "cbe" ? settings.PAY_CBE_1_NUM : method === "cbebirr" ? settings.PAY_CBEBIRR_1_NUM : settings.PAY_TELEBIRR_1_NUM || "Loading..."}
                      </span>
                      <Copy className="w-4 h-4 text-primary cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigator.clipboard.writeText(method === "cbe" ? settings.PAY_CBE_1_NUM : method === "cbebirr" ? settings.PAY_CBEBIRR_1_NUM : settings.PAY_TELEBIRR_1_NUM || "")} />
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {method === "cbe" ? settings.PAY_CBE_1_NAME : method === "cbebirr" ? settings.PAY_CBEBIRR_1_NAME : settings.PAY_TELEBIRR_1_NAME || "Loading..."}
                    </span>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-3 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-foreground text-sm tracking-widest">
                        {method === "cbe" ? settings.PAY_CBE_2_NUM : method === "cbebirr" ? settings.PAY_CBEBIRR_2_NUM : settings.PAY_TELEBIRR_2_NUM || "Loading..."}
                      </span>
                      <Copy className="w-4 h-4 text-primary cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigator.clipboard.writeText(method === "cbe" ? settings.PAY_CBE_2_NUM : method === "cbebirr" ? settings.PAY_CBEBIRR_2_NUM : settings.PAY_TELEBIRR_2_NUM || "")} />
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {method === "cbe" ? settings.PAY_CBE_2_NAME : method === "cbebirr" ? settings.PAY_CBEBIRR_2_NAME : settings.PAY_TELEBIRR_2_NAME || "Loading..."}
                    </span>
                  </div>
                </div>
                <p>{t("deposit.step2")}</p>
                <p>{t("deposit.step3")}</p>
              </div>
            </div>

            {/* Guide Section */}
            <div className="card-game rounded-xl p-4 space-y-3">
              <p className="text-xs font-display font-bold text-muted-foreground uppercase">{t("deposit.guide")}</p>
              
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted">
                {[1, 2, 3, 4].map(idx => (
                  <button 
                    key={idx} 
                    onClick={() => setSelectedImage(`https://placehold.co/600x400/1e293b/38bdf8?text=${method.toUpperCase()}+Step+${idx}`)}
                    className="flex-shrink-0 w-24 h-16 rounded-md overflow-hidden border border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <img src={`https://placehold.co/150x100/1e293b/38bdf8?text=${method.toUpperCase()}+Step+${idx}`} alt="Step Thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <div className="w-full bg-muted rounded-xl aspect-video overflow-hidden border border-border relative">
                <iframe 
                  width="100%" 
                  height="100%" 
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ" 
                  title="YouTube video player" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                ></iframe>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Sender Name & Warning */}
      {method && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4 flex gap-3">
             <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <span className="text-destructive font-bold">!</span>
             </div>
             <div>
                <p className="text-xs font-bold text-destructive mb-1 uppercase tracking-wider">{t("deposit.crucialRequirement")}</p>
                <p className="text-xs text-destructive/80 leading-relaxed font-medium">{t("deposit.senderWarning")}</p>
             </div>
          </div>
          <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("deposit.sendersName")}</label>
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder={t("deposit.senderPlaceholder")}
            className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-foreground font-display font-semibold text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </motion.div>
      )}

      {/* Payment ID */}
      {method && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("deposit.paymentId")}</label>
          <input
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder={t("deposit.paymentIdPlaceholder")}
            className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-foreground font-display font-semibold text-sm outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </motion.div>
      )}

      {method && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t("deposit.receiptRequired")}</label>
          <label className="card-game rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed border-border hover:border-primary/50 transition-colors">
            <Upload className="w-6 h-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{receipt?.name || t("deposit.tapToUpload")}</span>
            <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
          </label>
        </motion.div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setShowConfirm(true)}
        disabled={!amount || !method || !senderName || !receipt}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold text-lg glow-primary disabled:opacity-50 disabled:shadow-none"
      >
        {t("deposit.submitDeposit")}
      </motion.button>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.95 }} 
              animate={{ scale: 1 }} 
              exit={{ scale: 0.95 }}
              className="relative max-w-4xl w-full"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <img src={selectedImage} alt="Fullscreen guide" className="w-full h-auto rounded-xl border border-white/20 shadow-2xl" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <h3 className="text-xl font-display font-bold text-foreground mb-2">{t("deposit.confirmDeposit")}</h3>
              <p className="text-sm text-muted-foreground mb-6">{t("deposit.confirmDepositMsg")} <strong className="text-foreground text-base">{amount} ETB</strong> {t("deposit.confirmDepositMsgEnd") || "?"}</p>
              
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border hover:bg-muted/80 transition-colors"
                >
                  {t("deposit.noCancel")}
                </button>
                <button 
                  onClick={() => {
                    setShowConfirm(false);
                    handleSubmit();
                  }}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm glow-primary hover:opacity-90 transition-opacity"
                >
                  {t("deposit.yesProceed")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default DepositPage;
