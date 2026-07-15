'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, GraduationCap } from 'lucide-react';

interface Props {
  title: string;
  /** Short eyebrow above the title, e.g. "Demo · Company fundamentals". */
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Fullscreen takeover that hosts a real app surface for a Demo-mode lesson.
 * Modeled on AdvancedChartModal: portals to document.body, locks body scroll,
 * closes on Esc. The content area scrolls independently so surfaces taller than
 * the viewport (statistics grid, portfolio dashboard) work, and the DemoTour
 * overlay (z-[120]) sits above this shell (z-[100]).
 *
 * Rendered only via ssr:false dynamic import, so document is always available.
 */
export function DemoSurfaceShell({ title, eyebrow, onClose, children }: Props) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GraduationCap className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">{eyebrow}</p>
            )}
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit demo"
          className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable surface area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">{children}</div>
      </div>
    </motion.div>,
    document.body,
  );
}
