import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface TurnTimerCountdownProps {
  remainingMs: number | null;
  isMyTurn: boolean;
}

export default function TurnTimerCountdown({ remainingMs, isMyTurn }: TurnTimerCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  // Record exactly when the timer event was received to avoid clock drift
  const receivedAtRef = useRef<number>(0);

  useEffect(() => {
    if (remainingMs === null) {
      setTimeLeft(null);
      return;
    }
    // Record the receipt time once per new timer event
    receivedAtRef.current = Date.now();
    const update = () => {
      const elapsed = Date.now() - receivedAtRef.current;
      const remaining = Math.max(0, Math.ceil((remainingMs - elapsed) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [remainingMs]);

  if (remainingMs === null || timeLeft === null) return null;

  const isWarning = timeLeft <= 5 && isMyTurn;
  const label = isMyTurn ? "⏱ Your turn" : "⏱ Opponent thinking";

  // Use a portal to render at the top level of the DOM to avoid CSS containment issues
  return createPortal(
    <>
      {/* Timer pill */}
      <div
        style={{
          position: "fixed",
          top: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 99999,
          padding: "8px 20px",
          borderRadius: "9999px",
          fontWeight: "bold",
          fontSize: isWarning ? "18px" : "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: isWarning
            ? "0 0 30px rgba(239, 68, 68, 0.6), 0 4px 20px rgba(0,0,0,0.3)"
            : "0 4px 20px rgba(0,0,0,0.3)",
          border: isWarning ? "2px solid #ef4444" : "2px solid rgba(255,255,255,0.15)",
          backgroundColor: isWarning ? "#ef4444" : "rgba(0,0,0,0.85)",
          color: isWarning ? "#ffffff" : "#ffffff",
          animation: isWarning ? "pulse 0.5s ease-in-out infinite alternate" : "none",
          transition: "all 0.3s ease",
          pointerEvents: "none" as const,
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: isWarning ? "24px" : "16px", fontWeight: 900 }}>
          {timeLeft}s
        </span>
      </div>

      {/* Full-screen red flash overlay when warning */}
      {isWarning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99998,
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            pointerEvents: "none" as const,
            animation: "flashRed 0.8s ease-in-out infinite",
          }}
        />
      )}

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes pulse {
          0% { transform: translateX(-50%) scale(1); }
          100% { transform: translateX(-50%) scale(1.08); }
        }
        @keyframes flashRed {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
      `}</style>
    </>,
    document.body
  );
}
