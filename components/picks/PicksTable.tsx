'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronsUpDown, Minus } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import { intlLocale } from '@/lib/i18n/intl-locale';
import type { PickWithPerformance } from '@/lib/picks/types';
import { CATALYST_KEY, DIRECTION_TEXT, directionOf, fmtDate, fmtPct, fmtPrice } from './pick-format';

type SortKey = 'pickDate' | 'symbol' | 'returnPct' | 'vsBenchmark';
type SortDir = 'asc' | 'desc';

interface Props {
  picks: PickWithPerformance[];
}

function vsBenchmarkOf(p: PickWithPerformance): number | null {
  if (p.returnPct == null || p.benchmarkReturnPct == null) return null;
  return p.returnPct - p.benchmarkReturnPct;
}

/**
 * Every pick ever made, in one table.
 *
 * There is no filter for "winners only" and no way to hide a pick — a losing
 * row renders with exactly the same weight as a winning one. That's the point
 * of publishing this at all.
 */
export function PicksTable({ picks }: Props) {
  const { t, i18n } = useTranslation('discover');
  const locale = intlLocale(i18n.language);
  const [sortKey, setSortKey] = useState<SortKey>('pickDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const rows = [...picks];
    const factor = sortDir === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      switch (sortKey) {
        case 'symbol':
          return a.symbol.localeCompare(b.symbol) * factor;
        case 'returnPct':
        case 'vsBenchmark': {
          const av = sortKey === 'returnPct' ? a.returnPct : vsBenchmarkOf(a);
          const bv = sortKey === 'returnPct' ? b.returnPct : vsBenchmarkOf(b);
          // Picks without a stamped entry sort last in either direction rather
          // than masquerading as the worst (or best) result.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av - bv) * factor;
        }
        default:
          return a.pickDate.localeCompare(b.pickDate) * factor;
      }
    });
    return rows;
  }, [picks, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (picks.length === 0) {
    return (
      <p className="rounded-xl border border-border/50 bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
        {t('pickTableEmpty')}
      </p>
    );
  }

  const angle = (p: PickWithPerformance) =>
    p.catalystType in CATALYST_KEY ? t(CATALYST_KEY[p.catalystType as keyof typeof CATALYST_KEY]) : p.catalystType;

  return (
    <>
      {/* Phones: one card per pick. As a table, Return and vs S&P sat behind a
          sideways scroll, and a track record whose returns are off-screen is
          just a list of tickers. */}
      <ul className="space-y-2 md:hidden">
        {sorted.map((p) => {
          const dir = directionOf(p.returnPct);
          const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
          const vs = vsBenchmarkOf(p);
          return (
            <li key={p.pickDate}>
              <Link
                href={`/picks/${p.pickDate}`}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3 transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <CompanyLogo name={p.companyName ?? p.symbol} ticker={p.symbol} logoUrl={p.logoUrl} size={32} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-bold text-foreground">{p.symbol}</span>
                  <span className="block text-xs text-muted-foreground">{fmtDate(p.pickDate, locale)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn('inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums', DIRECTION_TEXT[dir])}>
                    {p.returnPct != null && <DirIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
                    {p.entryPrice == null ? t('pickEntryPending') : fmtPct(p.returnPct)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('pickColVsSp')}{' '}
                    <span className={cn('font-mono tabular-nums', DIRECTION_TEXT[directionOf(vs)])}>{fmtPct(vs)}</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border/50 bg-card/40 md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">{t('pickTableCaption')}</caption>
          <thead>
            <tr className="border-b border-border/50">
              <SortableHeader label={t('pickColPick')} active={sortKey === 'symbol'} dir={sortDir} onClick={() => toggleSort('symbol')} className="text-left" />
              <SortableHeader label={t('pickColPicked')} active={sortKey === 'pickDate'} dir={sortDir} onClick={() => toggleSort('pickDate')} className="text-left" />
              <PlainHeader label={t('pickColEntry')} />
              <PlainHeader label={t('pickColNow')} />
              <SortableHeader label={t('pickColReturn')} active={sortKey === 'returnPct'} dir={sortDir} onClick={() => toggleSort('returnPct')} className="text-right" />
              <SortableHeader label={t('pickColVsSp')} active={sortKey === 'vsBenchmark'} dir={sortDir} onClick={() => toggleSort('vsBenchmark')} className="text-right" />
              <PlainHeader label={t('pickColAngle')} className="text-left" />
            </tr>
          </thead>

          <tbody>
            {sorted.map((p) => {
              const dir = directionOf(p.returnPct);
              const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
              const vs = vsBenchmarkOf(p);
              const vsDir = directionOf(vs);

              return (
                <tr
                  key={p.pickDate}
                  className="group border-b border-border/30 last:border-b-0 transition-colors hover:bg-muted/25"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/picks/${p.pickDate}`}
                      className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <CompanyLogo
                        name={p.companyName ?? p.symbol}
                        ticker={p.symbol}
                        logoUrl={p.logoUrl}
                        size={24}
                        className="shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">
                          {p.symbol}
                        </span>
                        {/* clamp-ok: company name in a table cell, not a sentence */}
                        <span className="block max-w-[160px] truncate text-[11px] text-muted-foreground" title={p.companyName ?? undefined}>
                          {p.companyName ?? '—'}
                        </span>
                      </span>
                    </Link>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(p.pickDate, locale)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                    {p.entryPrice == null ? t('pickEntryPending') : `$${fmtPrice(p.entryPrice)}`}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12px] tabular-nums text-foreground/80">
                    {p.currentPrice == null ? '—' : `$${fmtPrice(p.currentPrice)}`}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span
                      className={cn(
                        'inline-flex items-center justify-end gap-1 font-mono text-[13px] font-semibold tabular-nums',
                        DIRECTION_TEXT[dir],
                      )}
                    >
                      {p.returnPct != null && <DirIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
                      {fmtPct(p.returnPct)}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className={cn('font-mono text-[12px] tabular-nums', DIRECTION_TEXT[vsDir])}>
                      {fmtPct(vs)}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex whitespace-nowrap rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {angle(p)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Headers ─────────────────────────────────────────────────────────────────

// Sentence case and the body font: uppercase was only half applied anyway,
// because buttons reset text-transform, so sortable headers read "Return"
// beside plain ones reading "ENTRY".
const HEADER_BASE = 'px-4 py-2.5 text-xs font-medium text-muted-foreground';

function PlainHeader({ label, className }: { label: string; className?: string }) {
  return <th scope="col" className={cn(HEADER_BASE, 'text-right', className)}>{label}</th>;
}

function SortableHeader({
  label, active, dir, onClick, className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const SortIcon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(HEADER_BASE, 'text-right', className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          active && 'text-foreground/80',
        )}
      >
        {label}
        <SortIcon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}
