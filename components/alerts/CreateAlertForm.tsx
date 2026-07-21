'use client';

import { useMemo, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { AlertTypePicker } from './AlertTypePicker';
import { describeAlert, type AlertType, type CreateAlertPayload } from '@/types/alerts';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
  onCreate: (payload: CreateAlertPayload) => Promise<{ ok: boolean; error?: string }>;
  /** Pre-fill and lock the ticker field (e.g. when opened from a stock page). */
  initialTicker?: { ticker: string; name: string };
  /** Pre-select a condition (e.g. opened from the chart's alert tool). */
  initialAlertType?: AlertType;
  /** Pre-fill the target price (dollars) for price conditions. */
  initialThreshold?: number;
}

export function CreateAlertForm({ onCreated, onCancel, onCreate, initialTicker, initialAlertType, initialThreshold }: Props) {
  const [ticker, setTicker] = useState<SearchResult | null>(
    initialTicker
      ? { ticker: initialTicker.ticker, name: initialTicker.name, cik: '', has_data: true }
      : null
  );
  const [alertType, setAlertType] = useState<AlertType | null>(initialAlertType ?? null);
  const [rawValue, setRawValue] = useState(initialThreshold != null ? String(initialThreshold) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const needsThreshold = alertType !== null && alertType !== 'all_time_high';
  const isPriceType   = alertType === 'price_above' || alertType === 'price_below';
  const isPctType     = alertType === 'pct_change_up' || alertType === 'pct_change_down' ||
                        alertType === 'near_52w_high' || alertType === 'near_52w_low';

  /** Normalises the raw input into the on-wire `threshold` shape: price = dollars,
   *  pct/proximity = decimal (5 → 0.05). */
  const parsedThreshold = useMemo<number | null>(() => {
    if (!alertType) return null;
    if (alertType === 'all_time_high') return 0;
    const n = parseFloat(rawValue);
    if (!isFinite(n) || n < 0) return null;
    return isPriceType ? n : n / 100;
  }, [alertType, rawValue, isPriceType]);

  const canSubmit = ticker !== null && alertType !== null && parsedThreshold !== null && !submitting;

  const preview = useMemo(() => {
    if (!ticker || !alertType || parsedThreshold === null) return null;
    return `You'll be alerted when ${ticker.ticker} ${describeAlert({ alertType, threshold: parsedThreshold }).toLowerCase()}.`;
  }, [ticker, alertType, parsedThreshold]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !ticker || !alertType || parsedThreshold === null) return;
    setSubmitting(true);
    setError(null);
    setLimitReached(false);
    const res = await onCreate({
      symbol: ticker.ticker,
      companyName: ticker.name,
      alertType,
      threshold: parsedThreshold,
    });
    setSubmitting(false);
    if (res.ok) {
      onCreated();
    } else if (res.code === 'free_limit_reached') {
      setLimitReached(true);
    } else {
      setError(res.error ?? "Couldn't create the alert. Please try again.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border/50 bg-card/40 p-5 space-y-5"
    >
      {/* Step 1 — stock */}
      {initialTicker ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
          <CompanyLogo name={initialTicker.name} ticker={initialTicker.ticker} logoUrl={null} size={24} className="rounded-md" />
          <span className="font-mono font-bold text-sm text-foreground">{initialTicker.ticker}</span>
          <span className="text-xs text-muted-foreground truncate">{initialTicker.name}</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
            Stock
          </label>
          <TickerSelector
            value={ticker}
            onChange={setTicker}
            placeholder="Search a stock (e.g. AAPL)"
          />
        </div>
      )}

      {/* Step 2 — condition */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
          Condition
        </label>
        <AlertTypePicker value={alertType} onChange={setAlertType} />
      </div>

      {/* Step 3 — threshold (only when needed) */}
      {needsThreshold && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
            {isPriceType ? 'Target price' : 'Threshold (%)'}
          </label>
          <div className="relative">
            {isPriceType && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 font-mono pointer-events-none">
                $
              </span>
            )}
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={isPriceType ? '0.01' : '0.1'}
              value={rawValue}
              onChange={(e) => setRawValue(e.target.value)}
              placeholder={isPriceType ? '200.00' : isPctType ? '5' : ''}
              className={isPriceType ? 'pl-7 font-mono tabular-nums' : 'font-mono tabular-nums'}
              autoFocus
            />
            {isPctType && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 font-mono pointer-events-none">
                %
              </span>
            )}
          </div>
        </div>
      )}

      {/* Live preview */}
      {preview && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2">
          <p className="text-xs text-foreground/85 leading-relaxed">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500/80 mr-1.5">Preview</span>
            {preview}
          </p>
        </div>
      )}

      {/* Limit reached — upgrade CTA */}
      {limitReached && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 flex items-start gap-2">
          <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-300 font-medium">You&apos;ve reached the 5-stock limit on the free plan.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pause all alerts on a stock to free up a slot, or{' '}
              <Link href="/pricing" className="text-amber-400 hover:underline">upgrade to Pro</Link>
              {' '}for unlimited stocks.
            </p>
          </div>
        </div>
      )}

      {/* Generic error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit}
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</> : 'Create alert'}
        </Button>
      </div>
    </form>
  );
}
