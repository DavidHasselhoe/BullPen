'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { WatchlistItem } from '@/hooks/use-watchlist';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { EnhancedDataMap } from '@/hooks/use-watchlist-enhanced';

interface Quote {
  price: number;
  change: number;
  changePercent: number;
}

interface WatchlistTableProps {
  items: WatchlistItem[];
  quotes: Record<string, Quote | null>;
  enhancedData?: EnhancedDataMap;
  onRemove: (symbol: string) => void;
  isRemoving?: (symbol: string) => boolean;
}

type SortKey = 'symbol' | 'price' | 'changePercent' | 'health' | 'earnings' | 'marketCap' | 'added_at';
type SortDir = 'asc' | 'desc';

function gradeToNum(grade: string | undefined): number {
  return { A: 5, B: 4, C: 3, D: 2, F: 1 }[grade ?? ''] ?? 0;
}

function gradeColor(grade: string) {
  if (grade === 'A') return 'text-emerald-500';
  if (grade === 'B') return 'text-green-600';
  if (grade === 'C') return 'text-amber-500';
  return 'text-red-500';
}

function fmtMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
  return dir === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5" />
    : <ArrowDown className="h-3.5 w-3.5" />;
}

function Col({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (col: SortKey) => void;
}) {
  return (
    <button
      onClick={() => onSort(col)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <SortIcon col={col} sortKey={sortKey} dir={sortDir} />
    </button>
  );
}

export function WatchlistTable({ items, quotes, enhancedData, onRemove, isRemoving }: WatchlistTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('added_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const queryClient = useQueryClient();

  const prefetchSnapshot = useCallback((ticker: string) => {
    queryClient.prefetchQuery({
      queryKey: ['stock-snapshot', ticker],
      queryFn: () => fetch(`/api/stock/${ticker}/snapshot`).then((r) => r.json()),
      staleTime: 2 * 60 * 1000,
    });
  }, [queryClient]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...items].sort((a, b) => {
    const qa = quotes[a.symbol];
    const qb = quotes[b.symbol];
    const ea = enhancedData?.[a.symbol];
    const eb = enhancedData?.[b.symbol];

    let cmp = 0;
    switch (sortKey) {
      case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
      case 'price': cmp = (qa?.price ?? -Infinity) - (qb?.price ?? -Infinity); break;
      case 'changePercent': cmp = (qa?.changePercent ?? -Infinity) - (qb?.changePercent ?? -Infinity); break;
      case 'health': cmp = gradeToNum(ea?.healthScore?.grade) - gradeToNum(eb?.healthScore?.grade); break;
      case 'earnings': {
        const da = ea?.daysToEarnings ?? Infinity;
        const db = eb?.daysToEarnings ?? Infinity;
        cmp = da - db;
        break;
      }
      case 'marketCap': cmp = (ea?.marketCap ?? -Infinity) - (eb?.marketCap ?? -Infinity); break;
      case 'added_at': cmp = a.added_at.localeCompare(b.added_at); break;
    }

    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-48"><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Symbol" col="symbol" /></TableHead>
            <TableHead><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Price" col="price" /></TableHead>
            <TableHead><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Change" col="changePercent" /></TableHead>
            <TableHead><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Mkt Cap" col="marketCap" /></TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">P/E</TableHead>
            <TableHead><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Health" col="health" /></TableHead>
            <TableHead><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Earnings" col="earnings" /></TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Thesis</TableHead>
            <TableHead><Col sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} label="Added" col="added_at" /></TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item) => {
            const q = quotes[item.symbol];
            const enhanced = enhancedData?.[item.symbol];
            const isUp = (q?.changePercent ?? 0) > 0;
            const isDown = (q?.changePercent ?? 0) < 0;
            const removing = isRemoving?.(item.symbol) ?? false;

            return (
              <TableRow key={item.symbol} className={cn(removing && 'opacity-40')}>
                <TableCell>
                  <Link href={slugToAssetPath(item.symbol)} onMouseEnter={() => prefetchSnapshot(item.symbol)} className="hover:underline">
                    <span className="font-semibold text-foreground">{item.symbol}</span>
                    <span className="ml-2 text-xs text-muted-foreground truncate max-w-[140px] inline-block align-middle">
                      {item.company_name}
                    </span>
                  </Link>
                </TableCell>

                <TableCell className="tabular-nums font-medium">
                  {q ? `$${q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                </TableCell>

                <TableCell>
                  {q ? (
                    <div className={cn(
                      'tabular-nums text-sm font-medium leading-tight',
                      isUp && 'text-emerald-500',
                      isDown && 'text-red-500',
                      !isUp && !isDown && 'text-muted-foreground'
                    )}>
                      <div>{isUp ? '+' : ''}{(q.changePercent ?? 0).toFixed(2)}%</div>
                      <div className="text-xs opacity-70">
                        {isUp ? '+' : ''}{(q.change ?? 0) >= 0 && !isUp ? '' : ''}{(q.change ?? 0).toFixed(2)}
                      </div>
                    </div>
                  ) : '—'}
                </TableCell>

                <TableCell className="tabular-nums text-sm text-muted-foreground">
                  {enhanced?.marketCap != null ? fmtMarketCap(enhanced.marketCap) : '—'}
                </TableCell>

                <TableCell className="tabular-nums text-sm text-muted-foreground">
                  {enhanced?.peRatio != null && enhanced.peRatio > 0
                    ? enhanced.peRatio.toFixed(1)
                    : '—'}
                </TableCell>

                <TableCell>
                  {enhanced?.healthScore ? (
                    <span className={cn('text-sm font-bold', gradeColor(enhanced.healthScore.grade))}>
                      {enhanced.healthScore.grade}
                    </span>
                  ) : '—'}
                </TableCell>

                <TableCell className="text-sm">
                  {enhanced?.daysToEarnings != null ? (
                    <span className={cn(
                      enhanced.daysToEarnings === 0 ? 'text-red-500' : enhanced.daysToEarnings <= 14 ? 'text-amber-500' : 'text-muted-foreground'
                    )}>
                      {enhanced.daysToEarnings === 0 ? 'Today' : `${enhanced.daysToEarnings}d`}
                    </span>
                  ) : '—'}
                </TableCell>

                <TableCell>
                  {enhanced?.thesisSentiment ? (
                    <span className={cn(
                      'text-xs font-medium capitalize',
                      enhanced.thesisSentiment === 'bull' && 'text-emerald-500',
                      enhanced.thesisSentiment === 'bear' && 'text-red-500',
                      enhanced.thesisSentiment === 'neutral' && 'text-muted-foreground',
                    )}>
                      {enhanced.thesisSentiment}
                    </span>
                  ) : '—'}
                </TableCell>

                <TableCell className="text-xs text-muted-foreground">
                  {new Date(item.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </TableCell>

                <TableCell>
                  <button
                    onClick={() => onRemove(item.symbol)}
                    disabled={removing}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    aria-label={`Remove ${item.symbol}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
