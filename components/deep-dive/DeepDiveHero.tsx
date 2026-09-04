'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
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

// Bull % for a given stance+confidence — both fields the model always
// returns, so this needs no new AI output. Deliberately NOT derived from
// bull/bear bullet count: a report with 5 bull points and 6 bear points can
// still be a high-confidence bullish call, and a gauge built off raw counts
// would visually contradict the verdict badge sitting right above it.
const BULL_PCT: Record<Report['verdict']['stance'], Record<Report['verdict']['confidence'], number>> = {
  bullish: { high: 80, medium: 65, low: 55 },
  bearish: { low: 45, medium: 35, high: 20 },
  neutral: { high: 50, medium: 50, low: 50 },
  mixed:   { high: 50, medium: 50, low: 50 },
};

function BullBearGauge({ verdict }: { verdict: Report['verdict'] }) {
  const bullPct = BULL_PCT[verdict.stance][verdict.confidence];
  return (
    <div
      className="flex h-1.5 w-full max-w-xs overflow-hidden rounded-full"
      role="img"
      aria-label={`Bull/bear split: ${bullPct}% bull, ${100 - bullPct}% bear`}
    >
      <div className="bg-emerald-500" style={{ width: `${bullPct}%` }} />
      <div className="bg-red-500" style={{ width: `${100 - bullPct}%` }} />
    </div>
  );
}

// Relative for the first 24h, then an absolute date — used for BOTH
// generatedAt and dataAsOf so the two dates in the meta line never mismatch
// in format (previously dataAsOf was interpolated raw/unformatted).
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return fmtAbsolute(iso);
}

// dataAsOf is a bare "YYYY-MM-DD" string. new Date("YYYY-MM-DD") parses as
// UTC midnight, and toLocaleDateString then applies the LOCAL timezone,
// which can shift the displayed day by one in the evening at negative UTC
// offsets. Parse the parts explicitly instead of trusting that round-trip.
function fmtAbsolute(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STALE_DATA_DAYS = 14;

function isStale(dateStr: string): boolean {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return false;
  const days = (Date.now() - new Date(y, m - 1, d).getTime()) / (24 * 60 * 60 * 1000);
  return days > STALE_DATA_DAYS;
}

function Highlight({ label, title, detail }: { label: string; title: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground">{title}</div>
      {detail && <div className="text-[13px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

interface Props {
  report: Report;
  /** ISO timestamp this report was created/restored — drives the "Generated X ago" meta line. */
  when: string;
}

/**
 * Verdict stance is Deep Dive's own equivalent of a Risk Analysis score —
 * categorical rather than a 0-100 spectrum, so this keeps RA's tier-colored
 * headline / prose summary / optional 3-highlight strip shape but not its
 * gauge bar directly. It DOES get its own bull/bear gauge (BullBearGauge,
 * above) driven by stance+confidence rather than a 0-100 score — added
 * deliberately after review found the bull/bear block's two equal-width
 * columns read as 50/50 regardless of what the verdict actually concluded,
 * so a skimming reader got the opposite signal from the badge sitting right
 * above them. Confidence is always shown; risk/catalyst highlights are
 * opportunistic — the model doesn't guarantee those block types exist on
 * every report, unlike Risk Analysis's fixed schema.
 */
export function DeepDiveHero({ report, when }: Props) {
  const stance = STANCE_STYLE[report.verdict.stance];
  const risksBlock = report.blocks.find((b) => b.type === 'risks');
  const catalystsBlock = report.blocks.find((b) => b.type === 'catalysts');
  const topRisk = risksBlock?.type === 'risks' ? risksBlock.items[0] : undefined;
  const topCatalyst = catalystsBlock?.type === 'catalysts' ? catalystsBlock.items[0] : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo name={report.companyName} ticker={report.ticker} size={40} className="mt-0.5 border border-border/50" loading="eager" />
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
        </div>
        <div className="flex w-full shrink-0 flex-col items-end gap-1.5 sm:w-auto sm:max-w-[240px]">
          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', stance.cls)}>
            {stance.label}
            <span className="font-normal opacity-70"> · {CONFIDENCE_LABEL[report.verdict.confidence]} confidence</span>
          </span>
          <BullBearGauge verdict={report.verdict} />
          <p className="text-[10px] text-muted-foreground/70 text-right leading-snug">
            Generated {fmtRelative(when)}
            {report.dataAsOf && (
              <>
                {' · fundamentals as of '}
                <span className={cn(isStale(report.dataAsOf) && 'text-amber-500 font-medium')}>
                  {fmtAbsolute(report.dataAsOf)}
                </span>
              </>
            )}
            {' · AI-generated — verify before acting.'}
          </p>
        </div>
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
