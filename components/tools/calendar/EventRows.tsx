'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtEPS, fmtRevenue } from './format';
import { fmtShortDate } from '@/lib/dates/calendar-format';
import type { UnifiedEvent, EarningsItem, DividendItem, SplitItem, IPOItem } from './types';

// TYPE_ICONS moved to ./LogoTile, which is now the shared owner of type
// iconography across tiles, the day-cell count strip and the list rows.

// A BMO/AMC (before-open / after-close) badge used to render here. Removed as
// dead code: TwelveData returns `time: ""` on 100% of rows, verified live
// 2026-08-10 against BOTH /earnings_calendar and the per-symbol /earnings
// endpoint. Nothing could ever populate it, so it only implied we had report
// timing we do not. Revisit if a future data provider supplies the field.

const IPO_STATUS_COLORS: Record<string, string> = {
  expected: 'bg-sky-500/10 text-sky-400',
  priced: 'bg-emerald-500/10 text-emerald-400',
  filed: 'bg-muted/60 text-muted-foreground',
  withdrawn: 'bg-red-500/10 text-red-400',
};

/** 'beat' / 'miss' / 'inline' vs. estimate — null when there's nothing to compare against. */
function epsDirection(actual: number, estimate: number | null | undefined): 'beat' | 'miss' | 'inline' | null {
  if (estimate == null) return null;
  if (actual > estimate) return 'beat';
  if (actual < estimate) return 'miss';
  return 'inline';
}

// ─── Compact (grid cell) ──────────────────────────────────────────────────────

export function compactMetric(event: UnifiedEvent): string | null {
  if (event.type === 'earnings') {
    const e = event.raw as EarningsItem;
    // Once reported, the actual is more useful than a stale estimate.
    if (e.eps_actual != null) return fmtEPS(e.eps_actual);
    return e.eps_estimate != null ? fmtEPS(e.eps_estimate) : null;
  }
  if (event.type === 'dividends') {
    const d = event.raw as DividendItem;
    return d.dividend_amount != null ? `$${d.dividend_amount.toFixed(2)}` : null;
  }
  if (event.type === 'splits') {
    const s = event.raw as SplitItem;
    return s.ratio ?? null;
  }
  const ipo = event.raw as IPOItem;
  if (ipo.price_from != null) return `$${ipo.price_from}${ipo.price_to != null ? `–${ipo.price_to}` : ''}`;
  return null;
}

// CompactEventRow lived here. Replaced by LogoTile — grid cells now render a
// company logo rather than a type glyph and a ticker string. Its emerald
// "this is yours" dot is gone with it: DESIGN.md's One Signal Rule reserves
// emerald for gain/loss, so ownership is a primary-colored ring on the tile.

// ─── Detail (day dialog) ──────────────────────────────────────────────────────

/** Full-detail row — same visual language as the pre-redesign per-type list rows. Used inside DayDetailDialog. */
export function DetailEventRow({ event }: { event: UnifiedEvent }) {
  const { t } = useTranslation('tools');
  if (event.type === 'earnings') {
    const e = event.raw as EarningsItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo
            name={event.name || event.symbol}
            ticker={event.symbol}
            logoUrl={event.logoUrl}
            size={28}
            className="ring-1 ring-border/40"
          />
          <Link
            href={slugToAssetPath(e.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {e.symbol}
          </Link>
          {/* A fiscal-quarter chip used to sit here too — still dead: neither
              TD's /earnings_calendar nor Nasdaq's calendar returns it. The
              BMO/AMC badge below came back to life once calendar-days.ts
              started merging in Nasdaq's free calendar for near-term days,
              which actually populates `time` (TD's own feed returns "" on
              effectively every row). */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {e.name && <p className="text-xs text-muted-foreground truncate leading-tight">{e.name}</p>}
              {e.time === 'BMO' && (
                <span className="shrink-0 text-[10px] font-medium px-1 py-px bg-muted/60 rounded text-muted-foreground/85">
                  {t('calendarBeforeOpen')}
                </span>
              )}
              {e.time === 'AMC' && (
                <span className="shrink-0 text-[10px] font-medium px-1 py-px bg-muted/60 rounded text-muted-foreground/85">
                  {t('calendarAfterClose')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right text-xs shrink-0 space-y-0.5">
          {e.eps_actual != null ? (
            <div className="flex items-center justify-end gap-1">
              <span className="text-muted-foreground/80">{t('calendarEpsLabel')} </span>
              <span className={cn('font-semibold tabular-nums', e.eps_actual < 0 ? 'text-red-400' : 'text-foreground')}>
                {fmtEPS(e.eps_actual)}
              </span>
              {(() => {
                const dir = epsDirection(e.eps_actual!, e.eps_estimate);
                if (dir === 'beat') return <ArrowUpRight className="h-3 w-3 text-emerald-400" aria-label={t('calendarBeatEstimate')} />;
                if (dir === 'miss') return <ArrowDownRight className="h-3 w-3 text-red-400" aria-label={t('calendarMissedEstimate')} />;
                return null;
              })()}
            </div>
          ) : e.eps_estimate != null ? (
            <div>
              <span className="text-muted-foreground/80">{t('calendarEpsEstLabel')} </span>
              <span className={cn('font-semibold tabular-nums', e.eps_estimate < 0 ? 'text-red-400' : 'text-foreground')}>
                {fmtEPS(e.eps_estimate)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground/80">—</span>
          )}
          {e.eps_actual != null && e.eps_estimate != null && (
            <div className="text-[11px] text-muted-foreground/80">{t('calendarEstPrefix')} {fmtEPS(e.eps_estimate)}</div>
          )}
          {e.revenue_estimate != null && (
            <div className="text-[11px] text-muted-foreground/80">{t('calendarRevPrefix')} {fmtRevenue(e.revenue_estimate)}</div>
          )}
        </div>
      </div>
    );
  }

  if (event.type === 'dividends') {
    const d = event.raw as DividendItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo
            name={event.name || event.symbol}
            ticker={event.symbol}
            logoUrl={event.logoUrl}
            size={28}
            className="ring-1 ring-border/40"
          />
          <Link
            href={slugToAssetPath(d.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {d.symbol}
          </Link>
          <div className="min-w-0">
            {d.name && <p className="text-xs text-muted-foreground truncate">{d.name}</p>}
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/85 flex-wrap">
              {d.payment_date && <span>{t('calendarPayDate', { date: fmtShortDate(d.payment_date) })}</span>}
              {d.frequency && <span className="capitalize px-1 bg-muted/60 rounded">{d.frequency}</span>}
            </div>
          </div>
        </div>
        {d.dividend_amount != null && (
          <span className="text-sm font-semibold tabular-nums text-emerald-500 shrink-0">
            ${d.dividend_amount.toFixed(4)}
          </span>
        )}
      </div>
    );
  }

  if (event.type === 'splits') {
    const s = event.raw as SplitItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo
            name={event.name || event.symbol}
            ticker={event.symbol}
            logoUrl={event.logoUrl}
            size={28}
            className="ring-1 ring-border/40"
          />
          <Link
            href={slugToAssetPath(s.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {s.symbol}
          </Link>
          {s.name && <p className="text-xs text-muted-foreground truncate">{s.name}</p>}
        </div>
        {s.ratio && (
          <span className="text-xs font-bold font-mono text-foreground shrink-0 bg-muted px-2 py-0.5 rounded">
            {s.ratio}
          </span>
        )}
      </div>
    );
  }

  // ipo
  const ipo = event.raw as IPOItem;
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {ipo.symbol ? (
          <>
            <CompanyLogo
              name={event.name || event.symbol}
              ticker={event.symbol}
              logoUrl={event.logoUrl}
              size={28}
              className="ring-1 ring-border/40"
            />
            <Link
              href={slugToAssetPath(ipo.symbol)}
              className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {ipo.symbol}
            </Link>
          </>
        ) : (
          <span className="font-bold text-sm font-mono text-muted-foreground shrink-0 w-14">—</span>
        )}
        <div className="min-w-0">
          {ipo.name && <p className="text-xs text-muted-foreground truncate">{ipo.name}</p>}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {ipo.exchange && <span className="text-[11px] text-muted-foreground/80">{ipo.exchange}</span>}
            {ipo.status && (
              <span className={cn(
                'text-[11px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none capitalize',
                IPO_STATUS_COLORS[ipo.status.toLowerCase()] ?? 'bg-muted/60 text-muted-foreground',
              )}>
                {ipo.status}
              </span>
            )}
          </div>
        </div>
      </div>
      {(ipo.price_from != null || ipo.price_to != null) && (
        <div className="text-right text-xs shrink-0">
          <span className="font-semibold tabular-nums text-foreground">
            {ipo.price_from != null ? `$${ipo.price_from}` : ''}
            {ipo.price_from != null && ipo.price_to != null ? ' – ' : ''}
            {ipo.price_to != null ? `$${ipo.price_to}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
