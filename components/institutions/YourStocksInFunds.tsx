'use client';

/**
 * What the tracked funds did in the signed-in user's own holdings and
 * watchlist, each fund's latest 13F against the quarter before
 * (/api/institutions/overlap). The 13F twin of YourStocksInWashington: one row
 * per stock (buying and selling counts, the funds' logos), each opening to
 * which fund opened, added, trimmed or sold out, and its position after.
 *
 * Pro, like the Washington panel. Free users see which of their stocks moved
 * and which funds, not who did what. Hidden when nothing overlaps.
 *
 * Buy and sell are neutral with an arrow: emerald and red mean the user's own
 * gain and loss everywhere else, and a fund adding a stock is neither.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ProBadge } from '@/components/billing/ProBadge';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { OwnershipFilter, byOwnership, type Ownership } from '@/components/discover/OwnershipFilter';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { fmtUsd } from '@/lib/institutions/format';
import type { FundMove } from '@/lib/institutions/fund-overlap';
import { cn } from '@/lib/utils';
import { FundAvatar } from './FundAvatar';
import { quarterLabel } from './QuarterPicker';

type Fund = FundMove['fund'];

interface OverlapResponse {
  locked: boolean;
  symbolCount: number;
  held?: string[];
  names?: Record<string, string>;
  /** Pro. */
  moves?: FundMove[];
  /** Free. */
  symbols?: string[];
  funds?: Fund[];
}

interface StockGroup {
  symbol: string;
  held: boolean;
  moves: FundMove[];
  buying: number;
  selling: number;
}

const INITIAL_STOCKS = 5;
const LOGOS = 3;
const LOCKED_LOGOS = 8;
const isBuy = (m: FundMove) => m.status === 'new' || m.status === 'increased';

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

// ponytail: no remembered-shape placeholder like the Washington panel; add one if this panel's arrival makes the grid jump.
export function YourStocksInFunds() {
  const { t } = useTranslation('discover');
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [ownership, setOwnership] = useState<Ownership>('all');
  const { data } = useQuery({
    queryKey: ['institutions-overlap'],
    queryFn: async (): Promise<OverlapResponse> => {
      const res = await fetch('/api/institutions/overlap');
      if (!res.ok) throw new Error(`fund overlap ${res.status}`);
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (!data || data.symbolCount === 0) return null;
  const company = (symbol: string) => displayCompanyName(data.names?.[symbol] ?? symbol, symbol);
  const heldSet = new Set(data.held ?? []);
  const mixed = heldSet.size > 0 && heldSet.size < data.symbolCount;
  const filter = mixed ? <OwnershipFilter value={ownership} onChange={(v) => { setOwnership(v); setShowAll(false); }} /> : null;

  if (data.locked) {
    const symbols = byOwnership(data.symbols ?? [], ownership, (s) => heldSet.has(s));
    const funds = data.funds ?? [];
    return (
      <section aria-labelledby="fund-overlap-heading" className="mb-6 rounded-xl border border-border/50 bg-card/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h3 id="fund-overlap-heading" className="text-sm font-semibold text-foreground">
              {t('instOverlapTitleLocked', { count: data.symbolCount })} <ProBadge className="ml-1 align-middle" />
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('instOverlapLockedBody', { count: funds.length })}</p>
          </div>
          <Link
            href="/upgrade"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('instOverlapSeeWho')}
          </Link>
        </div>
        {filter && <div className="mt-3">{filter}</div>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <ul className="flex flex-wrap items-center" aria-label={t('instOverlapLockedStocks')}>
            {symbols.slice(0, LOCKED_LOGOS).map((s) => (
              <li key={s} title={company(s)}>
                <Link href={`/stock/${s}`} className="block rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span aria-hidden>
                    <CompanyLogo ticker={s} name={company(s)} size={32} />
                  </span>
                  <span className="sr-only">{company(s)}</span>
                </Link>
              </li>
            ))}
            {symbols.length > LOCKED_LOGOS && (
              <li className="px-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                <span aria-hidden>+{symbols.length - LOCKED_LOGOS}</span>
                <span className="sr-only">{t('congOverlapMoreStocks', { count: symbols.length - LOCKED_LOGOS })}</span>
              </li>
            )}
          </ul>
          <FundLogos funds={funds} max={5} />
        </div>
      </section>
    );
  }

  const moves = data.moves ?? [];
  const groups: StockGroup[] = [...groupBy(moves, (m) => m.symbol).entries()]
    .map(([symbol, ms]) => ({
      symbol,
      held: heldSet.has(symbol),
      // Biggest position first within a stock; sold-out ones (value 0) last.
      moves: [...ms].sort((a, b) => b.valueUsd - a.valueUsd),
      buying: ms.filter(isBuy).length,
      selling: ms.filter((m) => !isBuy(m)).length,
    }))
    .sort((a, b) => b.moves.length - a.moves.length || company(a.symbol).localeCompare(company(b.symbol)));
  if (groups.length === 0) return null;

  // Funds file for different quarters near a deadline; the title names the one most of them are on.
  const periods = groupBy(moves, (m) => m.period);
  const quarter = quarterLabel([...periods.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]);
  const fundCount = new Set(moves.map((m) => m.fund.slug)).size;
  const listed = byOwnership(groups, ownership, (g) => g.held);
  const shown = showAll ? listed : listed.slice(0, INITIAL_STOCKS);
  const toggle = (symbol: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  return (
    <section aria-labelledby="fund-overlap-heading" className="mb-6 rounded-xl border border-border/50 bg-card/40">
      <div className="px-4 pt-4 sm:px-5">
        <h3 id="fund-overlap-heading" className="text-sm font-semibold text-foreground">
          {t('instOverlapTitle', { count: groups.length, quarter })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('instOverlapSub', { count: fundCount })}</p>
        {filter && <div className="mt-3">{filter}</div>}
      </div>

      <ul className="mt-3 divide-y divide-border/50 border-t border-border/50">
        {shown.map((g) => (
          <StockRow key={g.symbol} group={g} name={company(g.symbol)} isOpen={open.has(g.symbol)} onToggle={() => toggle(g.symbol)} />
        ))}
      </ul>

      {listed.length > INITIAL_STOCKS && (
        <div className="border-t border-border/50 px-4 py-1 sm:px-5">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="min-h-11 rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showAll ? t('congOverlapShowFewer') : t('congOverlapShowAll', { count: listed.length })}
          </button>
        </div>
      )}
    </section>
  );
}

function StockRow({ group, name, isOpen, onToggle }: { group: StockGroup; name: string; isOpen: boolean; onToggle: () => void }) {
  const { t } = useTranslation('discover');
  const panelId = `fund-overlap-${group.symbol}`;
  const relation = group.held ? t('congOverlapOwned') : t('congOverlapWatching');
  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <span aria-hidden>
          <CompanyLogo ticker={group.symbol} name={name} size={36} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            {/* clamp-ok: a company name in a dense row; the ticker and the stock page carry the rest */}
            <span className="truncate text-sm font-semibold text-foreground" title={name}>{name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{group.symbol}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              <span aria-hidden>· </span>
              {relation}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs tabular-nums text-muted-foreground">
            {group.buying > 0 && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <ArrowUp className="h-3 w-3" aria-hidden />
                {t('instOverlapBuying', { count: group.buying })}
              </span>
            )}
            {group.selling > 0 && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <ArrowDown className="h-3 w-3" aria-hidden />
                {t('instOverlapSelling', { count: group.selling })}
              </span>
            )}
            <span className="sm:hidden">{relation}</span>
          </span>
        </span>
        <FundLogos funds={group.moves.map((m) => m.fund)} max={LOGOS} />
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} aria-hidden />
      </button>

      {isOpen && (
        <ul id={panelId} aria-label={t('instOverlapWhoTraded', { company: name })} className="px-4 pb-1 sm:pl-[68px] sm:pr-12">
          {group.moves.map((m) => (
            <MoveRow key={m.fund.slug} move={m} />
          ))}
          <li>
            <Link
              href={`/stock/${group.symbol}`}
              className="inline-flex min-h-11 items-center rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('congOverlapOpenStock', { company: name })}
            </Link>
          </li>
        </ul>
      )}
    </li>
  );
}

function MoveRow({ move }: { move: FundMove }) {
  const { t, i18n } = useTranslation('discover');
  const pct = (n: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(Math.abs(n)) + '%';
  const verb =
    move.status === 'new' ? t('instOverlapNew')
    : move.status === 'sold_out' ? t('instOverlapSoldOut')
    : move.status === 'increased' ? t('instOverlapAdded', { pct: pct(move.sharesChangePct ?? 0) })
    : t('instOverlapTrimmed', { pct: pct(move.sharesChangePct ?? 0) });
  const Icon = isBuy(move) ? ArrowUp : ArrowDown;
  return (
    <li className="flex items-center gap-3 border-t border-border/40 py-2.5 first:border-t-0">
      <FundAvatar displayName={move.fund.name} logoUrl={move.fund.logoUrl} size={28} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/discover/institutions/${move.fund.slug}`}
          className="block truncate rounded-sm text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* clamp-ok: a fund's name in a dense row */}
          {move.fund.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {move.fund.manager && <>{move.fund.manager}<span aria-hidden> · </span></>}
          <span className="whitespace-nowrap">{quarterLabel(move.period)}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <Icon className="h-3 w-3" aria-hidden />
          {verb}
        </span>
        {move.status !== 'sold_out' && (
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {move.portfolioPct != null
              ? t('instOverlapPosition', { value: fmtUsd(move.valueUsd), pct: `${move.portfolioPct.toFixed(1)}%` })
              : fmtUsd(move.valueUsd)}
          </p>
        )}
      </div>
    </li>
  );
}

/** Overlapping fund logos, first ones on top. Decorative: the names are in the rows. */
function FundLogos({ funds, max }: { funds: Fund[]; max: number }) {
  const unique = [...new Map(funds.map((f) => [f.slug, f])).values()];
  if (unique.length === 0) return null;
  const extra = unique.length - max;
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {unique.slice(0, max).map((f, i) => (
        <span key={f.slug} className={cn('rounded-full ring-2 ring-background', i > 0 && '-ml-2')} title={f.name}>
          <FundAvatar displayName={f.name} logoUrl={f.logoUrl} size={26} />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-xs tabular-nums text-muted-foreground ring-2 ring-background">
          +{extra}
        </span>
      )}
    </span>
  );
}
