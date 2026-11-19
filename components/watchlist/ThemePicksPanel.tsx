'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ClampedText } from '@/components/ui/ClampedText';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { useCreateWatchlistList, useAddToWatchlist } from '@/hooks/use-watchlist';
import { useQuota, useInvalidateQuota } from '@/hooks/use-quota';
import { useEntitlements } from '@/hooks/use-entitlements';
import { QUOTAS, quotaDecision } from '@/lib/billing/quotas';
import type { AiPick } from '@/lib/watchlist/ai-picks';

const THEME_MAX = 120; // AI_THEME_MAX_CHARS; that module is server-only

interface Props {
  /** The watchlist count paywall (a 403 from list creation). */
  onPaywall: () => void;
  /** `complete` is false when some picks failed to add (the panel shows why). */
  onCreated: (listId: string, complete: boolean) => void;
}

/** "Describe a theme": AI picks up to 5 stocks, the user reviews them, then the list is created. */
export function ThemePicksPanel({ onPaywall, onCreated }: Props) {
  const { t, i18n } = useTranslation('watchlist');
  const [theme, setTheme] = useState('');
  const [picks, setPicks] = useState<AiPick[] | null>(null);
  const [listName, setListName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { data: quota } = useQuota('watchlist_ai_fill');
  const { isPro } = useEntitlements();
  const invalidateQuota = useInvalidateQuota();
  const createList = useCreateWatchlistList();
  const addItem = useAddToWatchlist();

  const limitMessage = (used: number) => {
    const d = quotaDecision('watchlist_ai_fill', isPro, used);
    if (d.allowed) return null;
    return isPro
      ? t('aiPicksLimitPro', { limit: QUOTAS.watchlist_ai_fill.proCap })
      : t('aiPicksLimitFree', { limit: QUOTAS.watchlist_ai_fill.count, proLimit: QUOTAS.watchlist_ai_fill.proCap });
  };
  // Same rule the route enforces; a count from before the reset no longer applies.
  const blocked = quota && Date.now() < Date.parse(quota.resetsAt) ? limitMessage(quota.used) : null;

  const find = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch('/api/watchlist/ai-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: q, locale: i18n.language }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('rate_limited');
      if (!res.ok) throw new Error(data.error ?? 'unknown');
      return data.picks as AiPick[];
    },
    onSuccess: (result, q) => {
      setPicks(result);
      requestAnimationFrame(() => resultsRef.current?.focus()); // the form that had focus is gone
      setListName(q.slice(0, 60));
      invalidateQuota('watchlist_ai_fill'); // every run counts, matched or not
    },
    onError: (err: Error) => {
      if (err.message === 'quota_exceeded') {
        invalidateQuota('watchlist_ai_fill');
        setError(limitMessage(Infinity));
      } else if (err.message === 'rate_limited') {
        setError(t('aiPicksTooFast'));
      } else {
        setError(t('aiPicksError'));
      }
    },
  });

  function submitTheme(e: React.FormEvent) {
    e.preventDefault();
    const q = theme.replace(/\s+/g, ' ').trim();
    if (q.length < 3 || find.isPending) return;
    setError(null);
    find.mutate(q);
  }

  function reset() {
    setPicks(null);
    setError(null);
  }

  async function createFromPicks() {
    if (!picks?.length || !listName.trim() || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await createList.mutateAsync({ name: listName.trim(), color: null });
      if (!res.success || !res.list) {
        if (res.status === 403) onPaywall();
        else setError(t('templatesGenericError'));
        return;
      }
      const results = await Promise.allSettled(
        picks.map((p) => addItem.mutateAsync({ symbol: p.ticker, company_name: p.name, listId: res.list.id }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      onCreated(res.list.id, failed === 0);
      if (failed) {
        setPicks(null); // the list exists now; a second Create would make a duplicate
        setError(t('aiPicksPartialAdd', { count: failed }));
        return;
      }
      setTheme('');
      reset();
    } catch {
      setError(t('templatesGenericError'));
    } finally {
      setSaving(false);
    }
  }

  const removePick = (ticker: string) => {
    setPicks((prev) => prev?.filter((p) => p.ticker !== ticker) ?? null);
    resultsRef.current?.focus(); // the removed row's button took focus with it
  };

  return (
    <section aria-labelledby="ai-picks-title" className="rounded-xl border border-border bg-card/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ai-picks-title" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('aiPicksTitle')}
        </h3>
        {/* Own line on a phone; squeezed beside the title it wraps inside the pill. */}
        <div className="basis-full empty:hidden sm:basis-auto">
          <QuotaIndicator feature="watchlist_ai_fill" unit={{ singular: t('aiPicksUnitOne'), plural: t('aiPicksUnitOther') }} />
        </div>
      </div>

      {picks === null ? (
        <form onSubmit={submitTheme} className="mt-3 space-y-2">
          <p id="ai-picks-hint" className="text-xs text-muted-foreground">{t('aiPicksHint')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={t('aiPicksPlaceholder')}
              aria-label={t('aiPicksInputLabel')}
              aria-describedby="ai-picks-hint"
              maxLength={THEME_MAX}
              disabled={find.isPending}
            />
            <Button
              type="submit"
              size="sm"
              className="h-9 shrink-0 gap-1.5 rounded-full px-4 animate-ai-pill-shine"
              disabled={theme.trim().length < 3 || find.isPending || !!blocked}
            >
              {find.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{t('aiPicksFinding')}</>
                : t('aiPicksFind')}
            </Button>
          </div>
          {/* The search takes several seconds; hold the space the picks will fill. */}
          {find.isPending && (
            <>
            <p role="status" className="sr-only">{t('aiPicksFinding')}</p>
            <ul aria-hidden className="divide-y divide-border/60 pt-1">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-start gap-3 py-2.5">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-full max-w-sm" />
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </form>
      ) : (
        <div ref={resultsRef} tabIndex={-1} role="region" aria-label={t('aiPicksResultsLabel', { theme })} className="mt-3 space-y-3 outline-none">
          {picks.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">{t('aiPicksNoMatch')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {picks.map((p) => (
                <li key={p.ticker} className="flex items-start gap-3 py-2.5">
                  <CompanyLogo ticker={p.ticker} name={p.name} logoUrl={p.logoUrl} size={28} decorative />
                  {/* Name-First Rule (DESIGN.md): a beginner meets these stocks here for the first time. */}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      {/* clamp-ok: a company name in a one-line row; the full name is in the title */}
                      <span className="truncate text-sm font-semibold text-foreground" title={p.name}>{p.name}</span>
                      {p.name.toUpperCase() !== p.ticker && (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.ticker}</span>
                      )}
                    </p>
                    {p.reason && (
                      <ClampedText lines={4} className="mt-1" textClassName="text-xs leading-relaxed text-muted-foreground">{p.reason}</ClampedText>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePick(p.ticker)}
                    aria-label={t('aiPicksRemove', { symbol: p.ticker })}
                    className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picks.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{t('aiPicksListName')}</span>
              <Input value={listName} onChange={(e) => setListName(e.target.value)} maxLength={60} />
            </label>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={saving}>
              {t('aiPicksStartOver')}
            </Button>
            {picks.length > 0 && (
              <Button type="button" size="sm" onClick={createFromPicks} disabled={saving || !listName.trim()}>
                {saving
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />{t('templatesAdding')}</>
                  : t('aiPicksCreate', { count: picks.length })}
              </Button>
            )}
          </div>
        </div>
      )}

      {(error ?? (picks === null ? blocked : null)) && (
        <p role="alert" className="mt-3 text-sm text-destructive">{error ?? blocked}</p>
      )}
    </section>
  );
}
