'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LENS_LABELS, type DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

const STANCE_STYLE: Record<Report['verdict']['stance'], { label: string; cls: string }> = {
  bullish: { label: 'Bullish', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  bearish: { label: 'Bearish', cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
  neutral: { label: 'Neutral', cls: 'bg-muted text-muted-foreground border-border' },
  mixed:   { label: 'Mixed',   cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
};

const CONFIDENCE_LABEL: Record<Report['verdict']['confidence'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function Highlight({ label, title, detail }: { label: string; title: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground truncate">{title}</div>
      {detail && <div className="text-[13px] text-muted-foreground truncate">{detail}</div>}
    </div>
  );
}

interface Props {
  report: Report;
}

/**
 * Verdict stance is Deep Dive's own equivalent of a Risk Analysis score —
 * categorical rather than a 0-100 spectrum, so this skips RA's gauge bar
 * (forcing bullish/bearish onto a continuous scale would be gimmicky) but
 * keeps the same hero shape: tier-colored headline, prose summary, optional
 * 3-highlight strip. Confidence is always shown; risk/catalyst highlights
 * are opportunistic — the model doesn't guarantee those block types exist
 * on every report, unlike Risk Analysis's fixed schema.
 */
export function DeepDiveHero({ report }: Props) {
  const stance = STANCE_STYLE[report.verdict.stance];
  const risksBlock = report.blocks.find((b) => b.type === 'risks');
  const catalystsBlock = report.blocks.find((b) => b.type === 'catalysts');
  const topRisk = risksBlock?.type === 'risks' ? risksBlock.items[0] : undefined;
  const topCatalyst = catalystsBlock?.type === 'catalysts' ? catalystsBlock.items[0] : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" /> AI Deep Dive
            </span>
            <span className="text-[11px] text-muted-foreground/85">·</span>
            <span className="text-[11px] text-muted-foreground/80">{LENS_LABELS[report.lens]}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight">
            {report.companyName} <span className="text-muted-foreground font-mono text-base">${report.ticker}</span>
          </h1>
        </div>
        <span className={cn('shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border', stance.cls)}>
          {stance.label}
          <span className="font-normal opacity-70"> · {CONFIDENCE_LABEL[report.verdict.confidence]} confidence</span>
        </span>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-foreground/85">{report.headline}</p>

      <div className="rounded-lg border border-border/50 bg-muted/20 px-3.5 py-2.5">
        <p className="text-sm text-foreground/90 leading-relaxed">{report.verdict.oneLiner}</p>
      </div>

      {(topRisk || topCatalyst) && (
        <div className="grid grid-cols-1 gap-4 border-t border-border/20 pt-4 sm:grid-cols-2">
          {topRisk && (
            <Highlight label="Key risk" title={topRisk.title} detail={topRisk.detail} />
          )}
          {topCatalyst && (
            <Highlight label="Catalyst to watch" title={topCatalyst.title} detail={topCatalyst.timeframe} />
          )}
        </div>
      )}
    </div>
  );
}
