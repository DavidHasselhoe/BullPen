'use client';

import { RangeBar } from '@/components/viz/RangeBar';
import { CardShell, StatCell } from './CardPrimitives';

export interface KeyStatisticsOutput {
  ticker: string;
  marketCap: string;
  peRatioTTM: string;
  pbRatio: string;
  evToEbitda: string;
  beta: string;
  dividendYield: string;
  profitMargin: string;
  week52HighRaw?: number | null;
  week52LowRaw?: number | null;
}

export function KeyStatisticsResultCard({
  output,
  livePrice,
}: {
  output: KeyStatisticsOutput;
  /** Current price from a sibling getLiveQuote call in the same message, if any — powers the RangeBar marker. */
  livePrice?: number | null;
}) {
  const hasRange =
    output.week52HighRaw != null && output.week52LowRaw != null && output.week52HighRaw > output.week52LowRaw;

  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.ticker} Valuation</div>
      {hasRange && (
        <div className="mb-2.5 border-b border-border/40 pb-2.5">
          <RangeBar
            low={output.week52LowRaw!}
            high={output.week52HighRaw!}
            current={livePrice ?? null}
            srLabel={`52-week range $${output.week52LowRaw!.toFixed(2)} to $${output.week52HighRaw!.toFixed(2)}${
              livePrice != null ? `, currently $${livePrice.toFixed(2)}` : ''
            }`}
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        <StatCell label="Market Cap" value={output.marketCap} />
        <StatCell label="P/E (TTM)" value={output.peRatioTTM} />
        <StatCell label="P/B" value={output.pbRatio} />
        <StatCell label="EV/EBITDA" value={output.evToEbitda} />
        <StatCell label="Beta" value={output.beta} />
        <StatCell label="Div Yield" value={output.dividendYield} />
      </div>
    </CardShell>
  );
}
