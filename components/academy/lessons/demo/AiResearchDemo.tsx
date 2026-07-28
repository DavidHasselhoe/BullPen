'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Loader2, Sparkles, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { getAiResearchFixture } from '@/lib/academy/ai-research-fixtures';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  fixtureId: string;
  /** Called once the learner runs the research and the answer reveals. */
  onResearched: () => void;
  onClose: () => void;
  /** The DemoTour overlay, rendered above the surface. */
  children: ReactNode;
}

type Phase = 'idle' | 'thinking' | 'answered';

/**
 * AI-research demo: shows a real "Why Today?"-style sourced answer for an example
 * ticker, seeded entirely from a fixture (no live generation — see
 * lib/academy/ai-research-fixtures.ts for the rationale). The learner clicks
 * "Ask why it moved", a brief thinking state plays, and the sourced answer
 * reveals — which satisfies the tour's 'run-research' gate.
 */
export function AiResearchDemo({ fixtureId, onResearched, onClose, children }: Props) {
  const fx = getAiResearchFixture(fixtureId);
  const [phase, setPhase] = useState<Phase>('idle');

  const up = fx.changePercent >= 0;
  const MoveIcon = up ? TrendingUp : TrendingDown;

  const ask = () => {
    if (phase !== 'idle') return;
    setPhase('thinking');
    // Brief scripted "thinking" beat so it reads like a real generation, then reveal.
    window.setTimeout(() => {
      setPhase('answered');
      onResearched();
    }, 900);
  };

  return (
    <DemoSurfaceShell eyebrow="Demo · Researching with AI" title="Why Today?" onClose={onClose}>
      {/* Ticker header */}
      <div className="mb-6 flex items-center gap-3">
        <CompanyLogo name={fx.name} ticker={fx.ticker} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-foreground">{fx.ticker}</p>
          <p className="truncate text-sm text-muted-foreground">{fx.name}</p>
        </div>
        <div className="text-right">
          <p className="mono text-base font-semibold tabular-nums text-foreground">
            ${fx.price.toFixed(2)}
          </p>
          <span
            className={cn(
              'mono inline-flex items-center gap-1 text-sm font-semibold tabular-nums',
              up ? 'text-emerald-500' : 'text-red-500',
            )}
          >
            <MoveIcon className="h-3.5 w-3.5" />
            {up ? '+' : ''}{fx.changePercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* The "ask" affordance */}
      <div
        data-tour="ai-ask"
        className="rounded-xl border border-border/60 bg-muted/20 p-4"
      >
        <p className="mb-3 text-sm text-foreground">
          <span className="text-muted-foreground">You ask:</span>{' '}
          <span className="font-medium">&ldquo;{fx.question}&rdquo;</span>
        </p>
        <button
          type="button"
          onClick={ask}
          disabled={phase !== 'idle'}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-opacity',
            'bg-primary text-primary-foreground disabled:opacity-60',
          )}
        >
          {phase === 'thinking' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Researching…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {phase === 'answered' ? 'Answered' : 'Ask why it moved'}
            </>
          )}
        </button>
      </div>

      {/* The sourced answer */}
      <AnimatePresence>
        {phase === 'answered' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            data-tour="ai-answer"
            className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.04] p-4"
          >
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Why Today?
            </div>
            <p className="mb-3 text-sm font-semibold leading-relaxed text-foreground">
              {fx.headline}
            </p>
            <ul className="mb-4 space-y-2">
              {fx.catalysts.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                  {c}
                </li>
              ))}
            </ul>

            {/* Sources — the teachable point: an answer you can verify */}
            <div data-tour="ai-sources">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
                Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {fx.sources.map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    <ExternalLink className="h-3 w-3 opacity-60" />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Hand off to the real feature */}
            <Link
              href={slugToAssetPath(fx.ticker)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              Try it live on a real stock
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </DemoSurfaceShell>
  );
}
