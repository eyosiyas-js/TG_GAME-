import { motion } from "framer-motion";
import { Wrench, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const MaintenanceOverlay = () => {
  const { t } = useTranslation();

  return (
    <div className="px-4 pt-6 min-h-screen flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="text-center max-w-sm"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-20 h-20 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-6"
        >
          <Wrench className="w-10 h-10 text-amber-500" />
        </motion.div>

        <h2 className="text-xl font-display font-bold text-foreground mb-3">
          {t("home.underMaintenance")}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {t("home.maintenanceDesc")}
        </p>

        <motion.div
          className="flex items-center justify-center gap-2 mb-8"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs text-amber-500 font-display font-bold uppercase tracking-widest">
            {t("home.updating")}
          </span>
          <div className="w-2 h-2 rounded-full bg-amber-500" />
        </motion.div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-muted text-foreground font-display font-bold text-sm border border-border hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.backToHome") || "Back to Home"}
        </Link>
      </motion.div>
    </div>
  );
};

export default MaintenanceOverlay;
