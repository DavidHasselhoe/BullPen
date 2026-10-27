'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CandlestickChart } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { encodeLevels, type ChartLevel } from '@/components/stock/advanced-chart/chart-context';
import { CardShell, StatCell } from './CardPrimitives';

interface Level { level: number; distancePct: number; touches: number }

export interface TechnicalsOutput {
  ticker: string;
  price: number;
  movingAverages: { length: number; value: number; pctFromPrice: number }[];
  rsi14: number | null;
  high52w: { value: number; pctFromPrice: number };
  support: Level[];
  resistance: Level[];
  /** Absent in the model's copy; see toModelOutput on getTechnicals. */
  chart?: { t: number[]; c: number[]; sma50: (number | null)[]; sma200: (number | null)[] };
}

const W = 300;
const H = 120;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/** A year of price with its 50/200-day averages and the levels Bull named. */
function TechnicalsChart({ output, ariaLabel }: { output: TechnicalsOutput; ariaLabel: string }) {
  const chart = output.chart!;
  const levels = [...output.support, ...output.resistance];
  const values = [...chart.c, ...chart.sma50, ...chart.sma200, ...levels.map((l) => l.level)]
    .filter((v): v is number => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.06 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const x = (i: number) => (i / Math.max(1, chart.c.length - 1)) * W;
  const path = (series: (number | null)[]) => {
    let d = '';
    let pen = false;
    series.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const up = chart.c[chart.c.length - 1] >= chart.c[0];
  // Two levels a few dollars apart would print one label over the other.
  const labelled = [...levels]
    .sort((a, b) => y(a.level) - y(b.level))
    .reduce<Level[]>((kept, l) => {
      const prev = kept[kept.length - 1];
      return prev && y(l.level) - y(prev.level) < 14 ? kept : [...kept, l];
    }, []);

  return (
    <div className="relative mt-2.5">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full overflow-visible" role="img" aria-label={ariaLabel}>
        {levels.map((l) => (
          <line
            key={l.level}
            x1={0} x2={W} y1={y(l.level)} y2={y(l.level)}
            stroke="var(--muted-foreground)" strokeOpacity={0.7} strokeWidth={1.25}
            strokeDasharray="1 3" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={path(chart.sma200)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.25} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        <path d={path(chart.sma50)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        <path d={path(chart.c)} fill="none" stroke={up ? 'var(--gain)' : 'var(--loss)'} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Labels in HTML: SVG text would stretch with preserveAspectRatio="none". */}
      {labelled.map((l) => (
        <span
          key={l.level}
          className="pointer-events-none absolute right-0 -translate-y-1/2 rounded bg-background/85 px-1 text-[10px] tabular-nums text-muted-foreground"
          style={{ top: `${(y(l.level) / H) * 100}%` }}
        >
          {l.level.toFixed(2)}
        </span>
      ))}
    </div>
  );
}

export function TechnicalsResultCard({ output }: { output: TechnicalsOutput }) {
  const { t } = useTranslation('ai');
  const averages = output.movingAverages.filter((m) => m.length === 50 || m.length === 200);
  const shown = (averages.length ? averages : output.movingAverages).slice(0, 2);
  const levels: ChartLevel[] = [
    ...output.support.map((l) => ({ price: l.level, kind: 'support' as const })),
    ...output.resistance.map((l) => ({ price: l.level, kind: 'resistance' as const })),
  ];
  const path = slugToAssetPath(output.ticker);
  const chartHref = `${path}?chart=fullscreen${levels.length ? `&levels=${encodeLevels(levels)}` : ''}`;

  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <Link href={path} className="group flex min-w-0 items-center gap-2">
          <CompanyLogo ticker={output.ticker} name={output.ticker} size={28} />
          <div className="min-w-0">
            <div className="font-semibold text-foreground group-hover:underline">{output.ticker}</div>
            <div className="text-muted-foreground">{t('technicalsCardTitle')}</div>
          </div>
        </Link>
        <div className="text-lg font-semibold tabular-nums text-foreground">${output.price.toFixed(2)}</div>
      </div>

      {output.chart && output.chart.c.length > 1 && (
        <>
          <TechnicalsChart output={output} ariaLabel={t('technicalsChartAria', { ticker: output.ticker })} />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-muted-foreground" aria-hidden />{t('technicalsLegend50')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-muted-foreground" aria-hidden />{t('technicalsLegend200')}</span>
            {levels.length > 0 && (
              <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dotted border-muted-foreground" aria-hidden />{t('technicalsLegendLevels')}</span>
            )}
          </div>
        </>
      )}

      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-border/40 pt-2 sm:grid-cols-4">
        {shown.map((m) => (
          <StatCell key={m.length} label={t('technicalsVsSma', { length: m.length })} value={pct(m.pctFromPrice)} />
        ))}
        <StatCell label={t('technicalsRsi')} value={output.rsi14 != null ? output.rsi14.toFixed(0) : '—'} />
        <StatCell label={t('technicalsFromHigh')} value={pct(output.high52w.pctFromPrice)} />
      </div>

      <Link
        href={chartHref}
        className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border/60 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CandlestickChart className="h-3.5 w-3.5" aria-hidden />
        {t('technicalsShowOnChart')}
      </Link>
    </CardShell>
  );
}
