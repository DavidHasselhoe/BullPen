'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown, Minus } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import { CATALYST_LABELS, type PickWithPerformance } from '@/lib/picks/types';
import { DIRECTION_TEXT, directionOf, fmtDate, fmtPct, fmtPrice } from './pick-format';

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
        No picks yet. The first one lands on a Monday.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/40">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">
          Every pick Bull has made, with its entry price, current price, and return since the pick.
        </caption>
        <thead>
          <tr className="border-b border-border/50">
            <SortableHeader
              label="Pick"
              active={sortKey === 'symbol'}
              dir={sortDir}
              onClick={() => toggleSort('symbol')}
              className="text-left"
            />
            <SortableHeader
              label="Picked"
              active={sortKey === 'pickDate'}
              dir={sortDir}
              onClick={() => toggleSort('pickDate')}
              className="text-left"
            />
            <PlainHeader label="Entry" />
            <PlainHeader label="Now" />
            <SortableHeader
              label="Return"
              active={sortKey === 'returnPct'}
              dir={sortDir}
              onClick={() => toggleSort('returnPct')}
              className="text-right"
            />
            <SortableHeader
              label="vs S&P"
              active={sortKey === 'vsBenchmark'}
              dir={sortDir}
              onClick={() => toggleSort('vsBenchmark')}
              className="text-right"
            />
            <PlainHeader label="Angle" className="text-left" />
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
                      <span className="block max-w-[160px] truncate text-[11px] text-muted-foreground/85">
                        {p.companyName ?? '—'}
                      </span>
                    </span>
                  </Link>
                </td>

                <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] tabular-nums text-muted-foreground">
                  {fmtDate(p.pickDate)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                  {p.entryPrice == null ? (
                    <span className="text-muted-foreground/85">pending</span>
                  ) : (
                    `$${fmtPrice(p.entryPrice)}`
                  )}
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
                    {CATALYST_LABELS[p.catalystType] ?? p.catalystType}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Headers ─────────────────────────────────────────────────────────────────

const HEADER_BASE =
  'px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80';

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
