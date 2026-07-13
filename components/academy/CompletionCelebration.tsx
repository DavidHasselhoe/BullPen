'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

interface Props {
  xpEarned: number;
  /** Auto-dismiss in milliseconds. Default 1600ms. */
  durationMs?: number;
  onDismiss?: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CompletionCelebration({ xpEarned, durationMs = 1600, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = prefersReducedMotion();

    if (!reduced) {
      // Two angled bursts so the screen feels symmetrically full
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.2, y: 0.6 },
        angle: 60,
        colors: ['#22c55e', '#10b981', '#34d399', '#fbbf24'],
        scalar: 0.9,
        ticks: 200,
      });
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.8, y: 0.6 },
        angle: 120,
        colors: ['#22c55e', '#10b981', '#34d399', '#fbbf24'],
        scalar: 0.9,
        ticks: 200,
      });
    }

    const t = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onDismiss]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => {
        setVisible(false);
        onDismiss?.();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 100%)' }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        className="text-center select-none"
      >
        <motion.img
          src="/illustrations/bull-celebrate.png"
          alt=""
          aria-hidden
          initial={{ scale: 0.5, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
          className="mx-auto mb-2 h-auto w-24 sm:w-28 opacity-95 dark:invert"
        />
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: [0.8, 1.15, 1] }}
          transition={{ duration: 0.6, times: [0, 0.55, 1] }}
          className="text-[88px] sm:text-[112px] font-mono font-black leading-none tabular-nums text-emerald-400"
          style={{ textShadow: '0 0 60px rgba(34,197,94,0.45)' }}
        >
          +{xpEarned}
        </motion.div>
        <div className="text-sm font-bold uppercase tracking-[0.35em] text-emerald-500 mt-2">
          XP earned
        </div>
      </motion.div>
    </motion.div>
  );
}
