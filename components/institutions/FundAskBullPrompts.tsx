'use client';

/**
 * Fund-specific conversation starters for Ask Bull.
 *
 * Deliberately rendered on the page rather than inside the chat panel. The
 * panel's starter chips are shared by every surface in the app and are driven
 * off aiContext.tickers.length, so making them fund-aware would mean threading
 * a prop through AIPanelProvider, AISidePanel and BullpenChat — shared
 * components — to change one page. Here they also sit where the reader already
 * has the numbers in front of them.
 *
 * Each prompt carries the fund's actual holdings in its text. The chat's
 * `context` field is only { tickers, label } with no free-form slot, and
 * lib/ai/tools.ts has no 13F tool, so anything the model should know has to be
 * in the message. The `[display:...]` prefix is the established convention for
 * that (see PortfolioRiskAnalysis): BullpenChat shows the short label, the
 * model receives the whole thing.
 */

import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useOwnedSymbols } from '@/hooks/use-owned-symbols';
import { friendlyIssuerName } from '@/lib/institutions/allocation';
import { fmtUsd } from '@/lib/institutions/format';
import type { Allocation } from '@/lib/institutions/allocation';
import type { HoldingsDiff } from '@/lib/institutions/compute-diff';

/**
 * How many holdings go into the prompt and the panel's ticker context.
 * POST /api/ai/chat rejects a body over 200 KB and Citadel holds 7166
 * positions, so this is a hard cap, not a stylistic one.
 */
const CONTEXT_HOLDINGS = 10;

interface FundAskBullPromptsProps {
  fundName: string;
  allocation: Allocation;
  diff?: HoldingsDiff | null;
  totalValueUsd?: number | null;
  positionCount?: number | null;
  className?: string;
}

export function FundAskBullPrompts({
  fundName,
  allocation,
  diff,
  totalValueUsd,
  positionCount,
  className,
}: FundAskBullPromptsProps) {
  const { open: openAIPanel } = useAIPanel();
  const ownedSymbols = useOwnedSymbols();

  const top = allocation.top.slice(0, CONTEXT_HOLDINGS);
  if (top.length === 0) return null;

  const topHolding = top[0];
  const topName = friendlyIssuerName(topHolding.name);
  const topPct = topHolding.pct.toFixed(1);

  /** The shared factual preamble every prompt carries. */
  const fundFacts = [
    `${fundName} 13F holdings.`,
    totalValueUsd ? `Portfolio value ${fmtUsd(totalValueUsd)} across ${positionCount ?? allocation.top.length + allocation.rest.length} positions.` : '',
    `Largest positions: ${top
      .map((h) => `${h.symbol ?? friendlyIssuerName(h.name)} ${h.pct.toFixed(1)}%`)
      .join(', ')}.`,
    diff ? formatMoves(diff) : '',
  ]
    .filter(Boolean)
    .join(' ');

  const ask = (label: string, question: string) => {
    openAIPanel({
      query: `[display:${label}]${fundFacts}\n\n${question}`,
      context: {
        tickers: top.map((h) => h.symbol).filter((s): s is string => !!s),
        label: fundName,
      },
    });
  };

  const prompts: Array<{ label: string; question: string }> = [
    {
      label: `Why so much ${topHolding.symbol ?? topName}?`,
      question: `Why would ${fundName} hold ${topPct}% of its portfolio in ${topName}? Explain the likely investment case in plain language for someone new to investing.`,
    },
    {
      label: `Is ${topPct}% in one stock risky?`,
      question: `Is putting ${topPct}% of a portfolio into a single stock, as ${fundName} has with ${topName}, too risky for a beginner? Explain what that concentration means for someone with a much smaller portfolio.`,
    },
  ];

  // Only offered when there is a portfolio to compare against, so the chat is
  // never opened on a question it has no way to answer.
  if (ownedSymbols.size > 0) {
    prompts.push({
      label: `Compare to my portfolio`,
      question: `I hold: ${[...ownedSymbols].join(', ')}. How does my portfolio compare to ${fundName}'s 13F holdings above? Point out overlaps, and where our concentration differs.`,
    });
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        Ask Bull about this fund
      </p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => ask(p.label, p.question)}
            className="rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-sm text-foreground/85 transition-colors hover:border-border hover:bg-card/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The quarter's moves, compactly, so the model can answer "what changed". */
function formatMoves(diff: HoldingsDiff): string {
  const parts: string[] = [];
  const names = (rows: Array<{ symbol: string | null; nameOfIssuer: string }>, n = 4) =>
    rows.slice(0, n).map((h) => h.symbol ?? friendlyIssuerName(h.nameOfIssuer)).join(', ');

  if (diff.newPositions.length) parts.push(`New positions: ${names(diff.newPositions)}.`);
  if (diff.increased.length) parts.push(`Increased: ${names(diff.increased)}.`);
  if (diff.decreased.length) parts.push(`Reduced: ${names(diff.decreased)}.`);
  if (diff.exited.length) parts.push(`Sold out of: ${names(diff.exited)}.`);
  return parts.length ? `Changes since last quarter: ${parts.join(' ')}` : '';
}
