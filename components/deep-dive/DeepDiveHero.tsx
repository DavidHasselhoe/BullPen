'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { VerdictBar } from './VerdictBar';
import type { DeepDivePrice } from '@/hooks/use-deep-dive-price';
import { LENS_LABELS, type DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

// Relative for the first 24h, then an absolute date — used for BOTH
// generatedAt and dataAsOf so the two dates in the meta line never mismatch
// in format (previously dataAsOf was interpolated raw/unformatted).
export function fmtRelative(iso: string): string {
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

interface Props {
  report: Report;
  /** ISO timestamp this report was created/restored — drives the "Generated X ago" meta line. */
  when: string;
  /** Ask Bull / Regenerate, rendered in the top row. Passed in rather than
   *  rendered by the parent beside the hero, so they don't reserve width down
   *  the whole hero column. */
  actions?: React.ReactNode;
  /** Resolved once per report by DeepDiveReport, so every price agrees. */
  price: DeepDivePrice;
}

/**
 * Layer 1 of the report: identity, then the verdict, then one sentence.
 *
 * The stance badge and the old stance+confidence gauge bar used to live here.
 * Both moved into VerdictBar, where the stance now sits beside a real computed
 * health score instead of a lookup-table percentage (see VerdictBar's header
 * for why that number was removed rather than restyled).
 *
 * The risk/catalyst highlight strip that used to close this component moved to
 * ThreeThings (layer 2), which renders it from authored sentences rather than
 * repeating risks[0] and catalysts[0] verbatim.
 */
export function DeepDiveHero({ report, when, actions, price }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo name={report.companyName} ticker={report.ticker} size={40} className="mt-0.5 border border-border/50" loading="eager" />
          <div className="min-w-0 space-y-1">
            {/* Lens name lives in the meta line to the right, not here. This
                column shares a row with that meta block inside a card capped
                at max-w-3xl, so "AI Deep Dive · Full deep dive" doesn't
                reliably fit on one line here -- it wrapped word-by-word, and
                once truncated, clipped to an unreadable "AI DEEP DIVE · F...".
                The meta paragraph wraps freely and has the room it needs. */}
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
                AI Deep Dive
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight">
              {report.companyName} <span className="text-muted-foreground font-mono text-base">${report.ticker}</span>
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
          <p className="text-[10px] leading-snug text-muted-foreground/70 sm:max-w-[260px] sm:text-right">
            {LENS_LABELS[report.lens]} · Generated {fmtRelative(when)}
            {report.dataAsOf && (
              <>
                {' · fundamentals as of '}
                <span className={cn(isStale(report.dataAsOf) && 'text-amber-500 font-medium')}>
                  {fmtAbsolute(report.dataAsOf)}
                </span>
              </>
            )}
            {' · AI-generated, verify before acting.'}
          </p>
        </div>
      </div>

      <VerdictBar ticker={report.ticker} verdict={report.verdict} price={price} />

      {/* The report's own title, then its single most important takeaway.
          These are the only two prose elements above the fold. */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-snug text-foreground text-balance">
          {report.headline}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-foreground/85">
          {report.verdict.oneLiner}
        </p>
      </div>

    </div>
  );
}
