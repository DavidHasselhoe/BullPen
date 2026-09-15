'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search, X } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';
import type { StockPick } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

const MAX_PICKS = 20;

/** Today's move for suggestions, from the shared movers cache (no per-visitor quote calls). */
function useSuggestionMoves() {
  return useQuery({
    queryKey: ['onboarding-suggestion-moves'],
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await fetch('/api/market/movers?limit=20');
      if (!res.ok) return {};
      const json = await res.json();
      const all = [...(json.movers?.gainers ?? []), ...(json.movers?.losers ?? [])] as { symbol: string; changePercent: number }[];
      return Object.fromEntries(all.map((m) => [m.symbol, m.changePercent]));
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function PickStocksStep({
  picks,
  onChange,
  onContinue,
  onBack,
  stepIndex,
  totalSteps,
}: {
  picks: StockPick[];
  onChange: (picks: StockPick[]) => void;
  onContinue: () => void;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  const [query, setQuery] = useState('');
  const { results } = useInstantSearch(query, 6);
  const { data: moves } = useSuggestionMoves();
  const picked = new Set(picks.map((p) => p.ticker));

  const toggle = (pick: StockPick) => {
    if (picked.has(pick.ticker)) onChange(picks.filter((p) => p.ticker !== pick.ticker));
    else if (picks.length < MAX_PICKS) onChange([...picks, pick]);
  };

  const list: StockPick[] = query.trim() ? results.map((r) => ({ ticker: r.ticker, name: r.name })) : STARTER_STOCKS;

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="Pick stocks you own or" accent="follow" />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        We&apos;ll add them to your watchlist so BullPen is ready when you arrive.
      </p>

      <label style={{ position: 'relative', display: 'block' }}>
        <span className="sr-only">Search for a stock or ETF</span>
        <Search size={16} aria-hidden style={{ position: 'absolute', left: 14, top: 14, color: 'var(--fg-dim)' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ticker"
          autoComplete="off"
          style={{
            width: '100%', height: 44, padding: '0 14px 0 40px', borderRadius: 12, fontSize: 15,
            border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--fg)',
          }}
        />
      </label>

      {picks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }} aria-label="Your picks">
          {picks.map((p) => (
            <button
              key={p.ticker}
              type="button"
              onClick={() => toggle(p)}
              aria-label={`Remove ${p.name}`}
              className="mono"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
                background: 'var(--accent-soft)', color: 'var(--accent)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {p.ticker} <X size={12} aria-hidden />
            </button>
          ))}
        </div>
      )}

      <p style={{ margin: '20px 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>
        {query.trim() ? 'Results' : 'Popular starting points'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((s) => {
          const isPicked = picked.has(s.ticker);
          const move = moves?.[s.ticker];
          return (
            <button
              key={s.ticker}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={isPicked}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '8px 14px',
                borderRadius: 12, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)',
                border: `1px solid ${isPicked ? 'var(--accent)' : 'var(--border)'}`,
                background: isPicked ? 'var(--accent-soft)' : 'var(--surface)',
              }}
            >
              <CompanyLogo name={s.name} ticker={s.ticker} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{s.ticker}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </span>
              {typeof move === 'number' && (
                <span className={`mono ${move >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12 }}>
                  {move >= 0 ? '▲ +' : '▼ −'}{Math.abs(move).toFixed(2)}%
                </span>
              )}
              {isPicked ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden style={{ color: 'var(--fg-dim)' }} />}
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn-primary" onClick={onContinue} style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
        {picks.length > 0 ? `Continue with ${picks.length} ${picks.length === 1 ? 'stock' : 'stocks'}` : 'Skip for now'}
      </button>
    </StepShell>
  );
}
