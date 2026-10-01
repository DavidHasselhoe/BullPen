'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { CardShell } from './CardPrimitives';

interface ScreenStocksRow {
  rank: number;
  ticker: string;
  name: string | null;
  healthScore: number | null;
  healthGrade: string | null;
  marketCap: string | null;
  pe: number | null;
  pb: number | null;
  beta: number | null;
  dividendYieldPct: number | null;
  profitMarginPct: number | null;
  revenueGrowthPct: number | null;
}

export interface ScreenStocksOutput {
  rankedBy: string;
  dataAsOf: string | null;
  results: ScreenStocksRow[];
}

/** rankedBy → [label key in the 'tools' namespace, value formatter]. Mirrors SCREEN_SORT_COLUMNS in lib/ai/tools.ts. */
const METRICS: Record<string, [string, (r: ScreenStocksRow) => string | null]> = {
  marketCap: ['screenerMarketCapLabel', (r) => r.marketCap],
  pe: ['screenerColPeRatioLabel', (r) => r.pe?.toFixed(1) ?? null],
  pb: ['screenerColPbRatioLabel', (r) => r.pb?.toFixed(1) ?? null],
  beta: ['screenerBetaLabel', (r) => r.beta?.toFixed(2) ?? null],
  dividendYield: ['screenerDividendYieldLabel', (r) => (r.dividendYieldPct != null ? `${r.dividendYieldPct}%` : null)],
  profitMargin: ['screenerProfitMarginLabel', (r) => (r.profitMarginPct != null ? `${r.profitMarginPct}%` : null)],
  revenueGrowth: ['screenerRevenueGrowthLabel', (r) => (r.revenueGrowthPct != null ? `${r.revenueGrowthPct}%` : null)],
};

function gradeClass(grade: string | null): string {
  if (grade === 'A' || grade === 'B') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (grade === 'C') return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
  return 'bg-red-500/10 text-red-500 border-red-500/20';
}

export function ScreenStocksResultCard({ output }: { output: ScreenStocksOutput }) {
  const { t, i18n } = useTranslation('ai');
  const { t: tTools } = useTranslation('tools');
  const metric = METRICS[output.rankedBy];
  const metricLabel = tTools(metric?.[0] ?? 'screenerHealthScoreLabel');
  const asOf = output.dataAsOf
    ? new Date(`${output.dataAsOf}T00:00:00Z`).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;

  return (
    <CardShell>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold text-foreground">{t('screenRankedBy', { metric: metricLabel })}</span>
        {asOf && <span className="shrink-0 text-[11px] text-muted-foreground">{t('screenDataAsOf', { date: asOf })}</span>}
      </div>
      <ol className="-mx-1.5">
        {output.results.map((r) => {
          const value = metric?.[1](r);
          return (
            <li key={r.ticker}>
              <Link
                href={slugToAssetPath(r.ticker)}
                className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
              >
                <span className="w-4 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">{r.rank}</span>
                <CompanyLogo name={r.name ?? r.ticker} ticker={r.ticker} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">{r.ticker}</span>
                  {/* clamp-ok: company name in a dense ranked row, full name in title */}
                  <span className="block truncate text-[11px] text-muted-foreground" title={r.name ?? undefined}>{r.name}</span>
                </span>
                {value != null && <span className="shrink-0 tabular-nums font-medium text-foreground">{value}</span>}
                {r.healthScore != null && (
                  <span
                    className={cn('shrink-0 rounded-full border px-2 py-0.5 tabular-nums text-[11px] font-semibold', gradeClass(r.healthGrade))}
                    title={t('healthScoreBadge', { score: r.healthScore, grade: r.healthGrade ?? '' })}
                  >
                    {r.healthScore}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </CardShell>
  );
}
