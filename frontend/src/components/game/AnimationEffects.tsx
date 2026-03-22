import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Confetti Particle System ───
interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  velocityX: number;
  velocityY: number;
  shape: "circle" | "square" | "star";
}

const CONFETTI_COLORS = [
  "hsl(145, 100%, 45%)",  // primary green
  "hsl(265, 100%, 46%)",  // secondary purple
  "hsl(51, 100%, 50%)",   // accent gold
  "hsl(0, 84%, 60%)",     // red
  "hsl(200, 100%, 60%)",  // blue
  "hsl(320, 100%, 60%)",  // pink
];

export const ConfettiExplosion = ({ active, duration = 3000 }: { active: boolean; duration?: number }) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }
    const shapes: Particle["shape"][] = ["circle", "square", "star"];
    const newParticles: Particle[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 20,
      y: 40,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 1,
      velocityX: (Math.random() - 0.5) * 80,
      velocityY: -30 - Math.random() * 60,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }));
    setParticles(newParticles);
    const timer = setTimeout(() => setParticles([]), duration);
    return () => clearTimeout(timer);
  }, [active, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            rotate: 0,
            scale: 0,
            opacity: 1,
          }}
          animate={{
            left: `${p.x + p.velocityX}%`,
            top: `${p.y + p.velocityY + 120}%`,
            rotate: p.rotation + Math.random() * 720,
            scale: p.scale,
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 2 + Math.random(), ease: "easeOut" }}
          className="absolute"
          style={{ width: 8, height: 8, backgroundColor: p.color, borderRadius: p.shape === "circle" ? "50%" : p.shape === "star" ? "2px" : "1px" }}
        />
      ))}
    </div>
  );
};

// ─── Screen Shake Effect ───
export const useScreenShake = () => {
  const [shaking, setShaking] = useState(false);
  const shake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }, []);
  return { shaking, shake, shakeClass: shaking ? "animate-shake" : "" };
};

// ─── Floating Particles Background ───
export const FloatingParticles = ({ count = 20 }: { count?: number }) => {
  const particles = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      duration: 10 + Math.random() * 20,
      delay: Math.random() * 5,
    }))
  ).current;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/40"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{
            y: [0, -30, 0, 20, 0],
            x: [0, 10, -10, 5, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
};

// ─── Ripple Effect Hook ───
export const useRipple = () => {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const nextId = useRef(0);

  const addRipple = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nextId.current++;
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
  }, []);

  const RippleContainer = () => (
    <div className="absolute inset-0 overflow-hidden rounded-inherit pointer-events-none">
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute w-8 h-8 rounded-full bg-primary/30"
          style={{ left: r.x - 16, top: r.y - 16 }}
        />
      ))}
    </div>
  );

  return { addRipple, RippleContainer };
};

// ─── Animated Counter ───
export const AnimatedCounter = ({ value, className = "" }: { value: number; className?: string }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === value) return;

    const diff = value - prev;
    const steps = Math.min(Math.abs(diff), 20);
    const stepDuration = 300 / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      setDisplay(Math.round(prev + (diff * step) / steps));
      if (step >= steps) clearInterval(interval);
    }, stepDuration);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <motion.span
      key={value}
      initial={{ scale: 1.3, color: "hsl(145, 100%, 45%)" }}
      animate={{ scale: 1, color: "inherit" }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {display}
    </motion.span>
  );
};

// ─── Pulse Ring Effect ───
export const PulseRing = ({ active, color = "primary" }: { active: boolean; color?: string }) => {
  if (!active) return null;
  return (
    <div className="absolute inset-0 pointer-events-none">
      <motion.div
        className={`absolute inset-0 rounded-inherit border-2 border-${color}`}
        animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <motion.div
        className={`absolute inset-0 rounded-inherit border-2 border-${color}`}
        animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
      />
    </div>
  );
};

// ─── Page Transition Wrapper ───
export const pageTransition = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
  transition: { duration: 0.3, ease: "easeOut" as const },
};

export const PageTransition = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={pageTransition.initial}
    animate={pageTransition.animate}
    exit={pageTransition.exit}
    transition={pageTransition.transition}
  >
    {children}
  </motion.div>
);

// ─── Stagger Container ───
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

// ─── Glow Pulse for active elements ───
export const GlowPulse = ({ children, active, color = "primary" }: { children: React.ReactNode; active: boolean; color?: string }) => (
  <motion.div
    animate={active ? {
      boxShadow: [
        `0 0 10px hsl(var(--${color}) / 0.2)`,
        `0 0 30px hsl(var(--${color}) / 0.5)`,
        `0 0 10px hsl(var(--${color}) / 0.2)`,
      ],
    } : {}}
    transition={{ duration: 1.5, repeat: Infinity }}
    className="relative"
  >
    {children}
  </motion.div>
);

// ─── Sound Effects (Web Audio API) ───
class SoundEngine {
  private ctx: AudioContext | null = null;

  private getCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.1) {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  tap() { this.playTone(800, 0.05, "sine", 0.06); }
  select() { this.playTone(600, 0.1, "sine", 0.08); }
  success() {
    this.playTone(523, 0.15, "sine", 0.08);
    setTimeout(() => this.playTone(659, 0.15, "sine", 0.08), 100);
    setTimeout(() => this.playTone(784, 0.2, "sine", 0.08), 200);
  }
  fail() {
    this.playTone(300, 0.2, "sawtooth", 0.06);
    setTimeout(() => this.playTone(200, 0.3, "sawtooth", 0.06), 150);
  }
  lose() {
    this.playTone(200, 0.4, "sawtooth", 0.08);
    setTimeout(() => this.playTone(150, 0.5, "sawtooth", 0.08), 200);
  }
  matchFound() {
    this.playTone(880, 0.1, "sine", 0.1);
    setTimeout(() => this.playTone(1100, 0.2, "sine", 0.1), 100);
  }
  win() {
    [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 0.2, "sine", 0.07), i * 80);
    });
  }
  roll() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.playTone(200 + Math.random() * 400, 0.05, "square", 0.04), i * 60);
    }
  }
  lineComplete() {
    this.playTone(440, 0.1, "sine", 0.08);
    setTimeout(() => this.playTone(554, 0.1, "sine", 0.08), 80);
    setTimeout(() => this.playTone(659, 0.15, "sine", 0.08), 160);
  }
}

export const sounds = new SoundEngine();
