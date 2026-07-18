'use client';

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
}

export function KeyStatisticsResultCard({ output }: { output: KeyStatisticsOutput }) {
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.ticker} Valuation</div>
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
