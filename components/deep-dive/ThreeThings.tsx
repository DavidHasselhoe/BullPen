'use client';

/**
 * Layer 2 of the Deep Dive report: the three things a reader must know, as
 * three compact cards between the verdict and everything else.
 *
 * Reads verdict.threeThings, which the model authors as one short sentence per
 * card. This replaces the old hero strip that rendered risks[0] and
 * catalysts[0] verbatim, repeating word for word what the full risks and
 * catalysts blocks said further down the same page.
 *
 * Reports generated before verdict.threeThings existed fall back to that older
 * strip rather than to an invented growth card. There is no honest way to
 * derive a growth sentence from an old report's blocks, and the fallback is
 * exactly today's behavior, so nothing regresses while old reports age out
 * through normal regeneration.
 *
 * The word caps in the prompt are guidance the model does not always honor
 * (one field came back 4 words over on the first live run), so these cards are
 * built to look right anywhere from about 10 to about 40 words. Nothing is
 * clamped or truncated: a card grows and the row grows with it.
 */

import { TrendingUp, AlertTriangle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { glossaryText } from '@/components/ui/GlossaryText';
import type { DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

interface CardSpec {
  label: string;
  icon: typeof TrendingUp;
  /** Border + fill + icon color. Growth and risk borrow the emerald/red the
   *  bull_bear block already uses for the same meanings; "watch" stays neutral
   *  because it is a date to look at, not a good or bad signal. */
  tint: string;
  iconColor: string;
}

const SPECS: Record<'growth' | 'risk' | 'watch', CardSpec> = {
  growth: {
    label: 'Growth',
    icon: TrendingUp,
    tint: 'border-emerald-500/20 bg-emerald-500/[0.04]',
    iconColor: 'text-emerald-500',
  },
  risk: {
    label: 'Biggest risk',
    icon: AlertTriangle,
    tint: 'border-red-500/20 bg-red-500/[0.04]',
    iconColor: 'text-red-500',
  },
  watch: {
    label: 'What to watch next',
    icon: Eye,
    tint: 'border-border/60 bg-muted/25',
    iconColor: 'text-muted-foreground',
  },
};

function ThingCard({ kind, text, seen }: { kind: keyof typeof SPECS; text: string; seen: Set<string> }) {
  const spec = SPECS[kind];
  const Icon = spec.icon;
  return (
    <div className={cn('flex flex-col rounded-xl border p-3.5', spec.tint)}>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', spec.iconColor)} aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/85">
          {spec.label}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-foreground/90">{glossaryText(text, seen)}</p>
    </div>
  );
}

/** Pre-threeThings reports: the old two-row strip, unchanged. */
function LegacyHighlights({ report }: { report: Report }) {
  const risksBlock = report.blocks.find((b) => b.type === 'risks');
  const catalystsBlock = report.blocks.find((b) => b.type === 'catalysts');
  const topRisk = risksBlock?.type === 'risks' ? risksBlock.items[0] : undefined;
  const topCatalyst = catalystsBlock?.type === 'catalysts' ? catalystsBlock.items[0] : undefined;
  if (!topRisk && !topCatalyst) return null;

  const seen = new Set<string>();
  return (
    <div className="space-y-3.5 border-t border-border/20 pt-4">
      {topRisk && (
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Key risk
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">{glossaryText(topRisk.title, seen)}</div>
          {topRisk.detail && (
            <div className="text-[13px] text-muted-foreground">{glossaryText(topRisk.detail, seen)}</div>
          )}
        </div>
      )}
      {topCatalyst && (
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Catalyst to watch
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">{glossaryText(topCatalyst.title, seen)}</div>
          {topCatalyst.timeframe && (
            <div className="text-[13px] text-muted-foreground">{topCatalyst.timeframe}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ThreeThings({ report }: { report: Report }) {
  const three = report.verdict.threeThings;
  if (!three) return <LegacyHighlights report={report} />;

  // One shared set across all three cards, same as every block does: a term
  // explained on the growth card doesn't need a second tooltip on the risk one.
  const seen = new Set<string>();

  return (
    <section aria-label="The three things that matter most">
      <div className="grid gap-3 sm:grid-cols-3">
        <ThingCard kind="growth" text={three.growth} seen={seen} />
        <ThingCard kind="risk" text={three.risk} seen={seen} />
        <ThingCard kind="watch" text={three.watch} seen={seen} />
      </div>
    </section>
  );
}
