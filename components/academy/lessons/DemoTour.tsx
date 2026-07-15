'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Generic guided-tour overlay for Demo-mode lessons. Generalizes CourseChartTour:
 * `target` is a free-form `data-tour` attribute value (or 'none' for a centered
 * tooltip with no spotlight), so each demo surface defines its own anchors.
 * Advancement can be gated on a surface-specific action via `isActionSatisfied`.
 */

export interface DemoTourStep {
  id: string;
  target: string;
  title: string;
  body: string;
  requiredAction: string;
}

interface Props {
  steps: DemoTourStep[];
  stepIndex: number;
  onStepIndexChange: (i: number) => void;
  /** Whether the current step's requiredAction is satisfied. Ignored when requiredAction is 'none'. */
  isActionSatisfied: boolean;
  onSkip: () => void;
  onFinish: () => void;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 340;

function tooltipStyle(rect: DOMRect | null): CSSProperties {
  if (!rect) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  }
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 16));
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow > 220 ? rect.bottom + 12 : Math.max(16, rect.top - 12);
  const transform = spaceBelow > 220 ? undefined : 'translateY(-100%)';
  return { left, top, transform };
}

export function DemoTour({ steps, stepIndex, onStepIndexChange, isActionSatisfied, onSkip, onFinish }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!step || step.target === 'none') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      return;
    }

    let raf: number | undefined;
    let cancelled = false;
    let scrolledOnce = false;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        // Demo surfaces scroll — bring an off-screen target into view once, then
        // let the scroll listener keep the spotlight aligned as it settles.
        if (!scrolledOnce) {
          scrolledOnce = true;
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        setRect(el.getBoundingClientRect());
      } else {
        raf = requestAnimationFrame(measure);
      }
    };
    measure();

    const onReposition = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [step]);

  if (!step) return null;

  const isLast = stepIndex === steps.length - 1;
  const canAdvance = step.requiredAction === 'none' || isActionSatisfied;

  const advance = () => {
    if (isLast) onFinish();
    else onStepIndexChange(stepIndex + 1);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      {/* Dimmed backdrop with a spotlight cutout (box-shadow trick — no SVG mask needed) */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-primary transition-all duration-200"
          style={{
            left: rect.left - SPOTLIGHT_PADDING,
            top: rect.top - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto absolute rounded-xl border border-border bg-background p-4 shadow-2xl"
          style={{ width: `min(${TOOLTIP_WIDTH}px, calc(100vw - 2rem))`, ...tooltipStyle(rect) }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {steps.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === stepIndex ? 'w-5 bg-primary' : i < stepIndex ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted',
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip tour"
              className="text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-1 text-sm font-semibold text-foreground">{step.title}</p>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
          {step.requiredAction !== 'none' && !isActionSatisfied && (
            <p className="mb-3 text-[11px] font-medium text-primary">Try it to continue →</p>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={advance}
              disabled={!canAdvance}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {isLast ? 'Finish' : 'Next'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
