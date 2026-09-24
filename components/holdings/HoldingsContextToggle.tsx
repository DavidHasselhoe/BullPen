'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Layers } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings } from '@/hooks/use-holdings';
import type { Position, WeightBasis } from '@/lib/holdings/portfolio-positions';
import { cn } from '@/lib/utils';

/**
 * "Let this read my holdings" — the consent, the preview and the opt-outs in
 * one control.
 *
 * Shared by every surface that offers to send the reader's positions to a
 * model (the portfolio builder's foundation, the deep dive's fit check), each
 * passing its own title and description so the control always names the thing
 * it is actually about to do.
 *
 * Nothing about someone's portfolio should reach a model because of a setting
 * they turned on months ago, so this is per generation and off by default. The
 * positions it would send are listed here before anything is submitted, and
 * any of them can be unticked: an unticked position is never loaded into the
 * prompt at all, not filtered out of an answer afterwards.
 *
 * The list comes from /api/holdings/positions, which runs the same loader the
 * prompt runs, so the weights on screen are the weights that get sent rather
 * than a second calculation that could drift from it. It is fetched only once
 * the switch is on, because pricing a book costs a quote per position.
 *
 * Hidden entirely for an investor with no holdings: a toggle that silently
 * does nothing is worse than no toggle.
 */
export function HoldingsContextToggle({
  enabled,
  onChange,
  disabled,
  title,
  description,
  excluded = [],
  onExcludedChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Each surface names the thing it is about to do with the positions. */
  title: string;
  description: string;
  /** Tickers the reader unticked. Omit the pair to offer no opt-outs at all. */
  excluded?: string[];
  onExcludedChange?: (next: string[]) => void;
}) {
  const { t } = useTranslation('tools');
  const { data: holdings } = useHoldings();
  const [listOpen, setListOpen] = useState(false);

  // Only decides whether this control renders at all, and supplies the logos.
  // Cheap: the holdings query is already cached by the time anyone sees this.
  const hasHoldings = useMemo(
    () => (holdings ?? []).some((h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0),
    [holdings],
  );
  const logoFor = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const h of holdings ?? []) map.set(h.symbol.toUpperCase(), h.logo_url ?? null);
    return map;
  }, [holdings]);

  const { data, isLoading } = useQuery<{ positions: Position[]; basis: WeightBasis }>({
    queryKey: ['holdings-positions'],
    queryFn: () => fetch('/api/holdings/positions').then((r) => r.json()),
    enabled: enabled && hasHoldings,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const positions = useMemo(() => data?.positions ?? [], [data]);
  const basis: WeightBasis = data?.basis ?? 'cost';

  // A position sold since the last build shouldn't keep suppressing a ticker
  // that no longer exists, and an exclusion list holding names the prompt
  // never sees would misstate what is being withheld.
  useEffect(() => {
    if (!onExcludedChange || positions.length === 0 || excluded.length === 0) return;
    const live = new Set(positions.map((p) => p.ticker));
    const pruned = excluded.filter((ticker) => live.has(ticker));
    if (pruned.length !== excluded.length) onExcludedChange(pruned);
  }, [positions, excluded, onExcludedChange]);

  if (!hasHoldings) return null;

  const excludedSet = new Set(excluded);
  const includedCount = positions.filter((p) => !excludedSet.has(p.ticker)).length;
  const canExclude = typeof onExcludedChange === 'function';

  const toggleTicker = (ticker: string, include: boolean) => {
    if (!onExcludedChange) return;
    onExcludedChange(
      include ? excluded.filter((e) => e !== ticker) : [...excluded, ticker],
    );
  };

  const summary = isLoading
    ? t('holdingsContextReading')
    : includedCount === positions.length
      ? t(basis === 'market' ? 'holdingsContextAllMarket' : 'holdingsContextAllCost', { count: includedCount })
      : t(basis === 'market' ? 'holdingsContextSomeMarket' : 'holdingsContextSomeCost', {
          count: includedCount,
          total: positions.length,
        });

  return (
    <div className="rounded-xl border border-border/60 bg-card/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={title}
        />
      </div>

      {enabled && (
        <div className="border-t border-border/40 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            disabled={isLoading}
            className={cn(
              'flex w-full items-center justify-between gap-2 text-xs text-muted-foreground',
              'transition-colors duration-150 hover:text-foreground disabled:hover:text-muted-foreground',
            )}
          >
            <span className={cn(isLoading && 'animate-pulse')}>{summary}</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', listOpen && 'rotate-180')}
              aria-hidden
            />
          </button>

          {listOpen && positions.length > 0 && (
            <>
              <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {positions.map((p) => {
                  const included = !excludedSet.has(p.ticker);
                  const row = (
                    <>
                      <CompanyLogo ticker={p.ticker} name={p.company} logoUrl={logoFor.get(p.ticker) ?? null} size={18} />
                      <span className="font-mono text-xs font-semibold text-foreground">{p.ticker}</span>
                      <span className="truncate text-xs text-muted-foreground">{p.company}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {p.weightPct.toFixed(1)}%
                      </span>
                    </>
                  );

                  if (!canExclude) {
                    return <li key={p.ticker} className="flex items-center gap-2">{row}</li>;
                  }

                  return (
                    <li key={p.ticker}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5',
                          'transition-colors duration-150 hover:bg-muted/40',
                          !included && 'opacity-45',
                        )}
                      >
                        <Checkbox
                          checked={included}
                          onCheckedChange={(next) => toggleTicker(p.ticker, next)}
                          disabled={disabled}
                          aria-label={t('holdingsContextIncludeAria', { ticker: p.ticker })}
                        />
                        {row}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {canExclude && includedCount < positions.length && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t('holdingsContextWithheldNote')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
