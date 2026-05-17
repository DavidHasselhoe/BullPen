'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Layers, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  phase: 'streaming' | 'composing' | 'validating';
}

const STEPS = [
  { key: 'streaming',  icon: Brain,       label: 'Analyzing thesis'    },
  { key: 'composing',  icon: Layers,      label: 'Composing portfolio' },
  { key: 'validating', icon: ShieldCheck, label: 'Validating tickers'  },
] as const;

const PHASE_ORDER: Record<Props['phase'], number> = {
  streaming: 0,
  composing: 1,
  validating: 2,
};

// Decorative skeleton rows for the composing phase (varying bar widths)
const SKELETON_ROWS = [
  { bar: '62%' }, { bar: '48%' }, { bar: '71%' }, { bar: '55%' },
  { bar: '44%' }, { bar: '58%' }, { bar: '67%' }, { bar: '52%' },
];

export function StreamingThoughts({ text, phase }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentStep = PHASE_ORDER[phase];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
      {/* Animated accent line along top edge */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background:
            currentStep === 2
              ? 'linear-gradient(90deg, transparent 10%, hsl(142 70% 45% / 0.45) 50%, transparent 90%)'
              : 'linear-gradient(90deg, transparent 10%, hsl(var(--primary) / 0.4) 50%, transparent 90%)',
        }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Phase stepper */}
      <div className="flex items-center px-5 pt-4 pb-3.5 border-b border-border/25">
        {STEPS.map((step, i) => {
          const isDone   = i < currentStep;
          const isActive = i === currentStep;
          const Icon     = isDone ? CheckCircle2 : step.icon;

          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Icon node with radial pulse when active */}
                <div className="relative">
                  {isActive && (
                    <motion.div
                      className="absolute inset-[-5px] rounded-full"
                      style={{
                        background:
                          'radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 70%)',
                      }}
                      animate={{ scale: [0.8, 1.6, 0.8], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'relative h-3.5 w-3.5 shrink-0 transition-all duration-500',
                      isDone   && 'text-emerald-400',
                      isActive && 'text-primary',
                      !isDone && !isActive && 'text-muted-foreground/20',
                    )}
                  />
                </div>
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors duration-300',
                    isDone   && 'text-emerald-400/60',
                    isActive && 'text-foreground/75',
                    !isDone && !isActive && 'text-muted-foreground/20',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-3 max-w-16 h-px bg-border/20 overflow-hidden rounded-full">
                  <motion.div
                    className="h-full bg-emerald-500/35"
                    animate={{ width: isDone ? '100%' : '0%' }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Phase-specific content area */}
      <AnimatePresence mode="wait">

        {/* ── Streaming: live AI reasoning text ───────────────────────────── */}
        {phase === 'streaming' && (
          <motion.div
            key="streaming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {/* macOS-style terminal chrome bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 bg-muted/[0.04]">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-muted/35" />
                <div className="w-2 h-2 rounded-full bg-muted/35" />
                <div className="w-2 h-2 rounded-full bg-muted/35" />
              </div>
              <span className="ml-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/25">
                AI Reasoning
              </span>
              <div className="ml-auto">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-primary/55"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              </div>
            </div>

            {/* Scrollable thinking stream */}
            <div
              ref={scrollRef}
              className="h-[300px] overflow-y-auto p-4 bg-muted/[0.03] [&::-webkit-scrollbar]:w-0 [scrollbar-width:none]"
            >
              <p className="font-mono text-[11.5px] leading-[1.75] text-foreground/55 whitespace-pre-wrap break-words">
                {text || (
                  <span className="text-muted-foreground/25 italic">
                    Decomposing the thesis into investable subsectors…
                  </span>
                )}
                {/* Blinking block cursor */}
                <motion.span
                  className="inline-block w-[1.5px] h-[12px] bg-primary/65 ml-px align-text-bottom"
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    times: [0, 0.4, 0.5, 0.95],
                  }}
                />
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Composing: skeleton portfolio rows ─────────────────────────── */}
        {phase === 'composing' && (
          <motion.div
            key="composing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="p-5"
          >
            {/* Bouncing dots + status label */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full bg-primary/50"
                    animate={{ y: [0, -3, 0] }}
                    transition={{
                      duration: 0.75,
                      repeat: Infinity,
                      delay: i * 0.12,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground/45 font-mono">
                Writing portfolio allocations…
              </span>
            </div>

            {/* Skeleton rows — animate in sequentially */}
            <div className="space-y-2">
              {SKELETON_ROWS.map((row, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-3 h-7"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.055, duration: 0.25 }}
                >
                  {/* Ticker badge placeholder */}
                  <div className="h-5 w-12 rounded-md bg-muted/25 shrink-0 animate-pulse" />
                  {/* Allocation bar */}
                  <div className="flex-1 h-1.5 rounded-full bg-muted/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary/22 to-primary/6"
                      initial={{ width: '0%' }}
                      animate={{ width: row.bar }}
                      transition={{
                        delay: i * 0.055 + 0.1,
                        duration: 0.55,
                        ease: 'easeOut',
                      }}
                    />
                  </div>
                  {/* % placeholder */}
                  <div className="h-4 w-9 rounded bg-muted/20 shrink-0 animate-pulse" />
                  {/* Role badge placeholder */}
                  <div className="h-4 w-14 rounded-full bg-muted/15 shrink-0 animate-pulse" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Validating: ring spinner ─────────────────────────────────────── */}
        {phase === 'validating' && (
          <motion.div
            key="validating"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center py-14 gap-4"
          >
            <div className="relative w-14 h-14">
              {/* Static track */}
              <div className="absolute inset-0 rounded-full border-[1.5px] border-border/25" />
              {/* Spinning arc */}
              <motion.div
                className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-primary/60 border-r-primary/20"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              />
              {/* Icon center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary/40" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/55">Verifying tickers</p>
              <p className="text-[11px] text-muted-foreground/35 mt-0.5">
                Cross-referencing NYSE &amp; NASDAQ listings
              </p>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
