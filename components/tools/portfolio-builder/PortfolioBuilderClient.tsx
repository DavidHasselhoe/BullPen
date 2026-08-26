'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ThesisInput } from './ThesisInput';
import { ProcessingScreen } from '@/components/ui/ProcessingScreen';
import { PortfolioResult } from './PortfolioResult';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, ChevronRight, Trash2, Search, X } from 'lucide-react';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';
import type { SavedGeneration } from '@/app/api/ai/portfolio-builder/history/route';
import type { QuotaState } from '@/lib/billing/quotas';
import { cn } from '@/lib/utils';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useInvalidateQuota } from '@/hooks/use-quota';
import { useMarkEntityNotificationsRead } from '@/hooks/use-notifications';

type Phase = 'idle' | 'streaming' | 'composing' | 'validating' | 'done' | 'error';
type ErrorCode = 'invalid_key' | 'payment_required' | 'rate_limited' | 'parse_failed' | 'too_few_valid_tickers' | 'quota_exceeded' | 'unknown';
type BuilderPhase = 'streaming' | 'composing' | 'validating';

const BUILDER_PHASE_ORDER: Record<BuilderPhase, number> = { streaming: 0, composing: 1, validating: 2 };

function getBuilderPhaseLabels(t: TFunction): string[] {
  return [t('portfolioBuilderPhaseAnalyzing'), t('portfolioBuilderPhaseComposing'), t('portfolioBuilderPhaseValidating')];
}

interface DoneEvent {
  type: 'done';
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
  createdAt?: string | null;
}

interface StatusResponse {
  success: boolean;
  status?: 'pending' | 'done' | 'error';
  phase?: BuilderPhase | null;
  thesis?: string;
  portfolio?: Portfolio | null;
  logoMap?: Record<string, string | null>;
  replacedTickers?: string[];
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
  createdAt?: string | null;
}

const HISTORY_KEY = ['portfolio-builder-history'];
const POLL_INTERVAL_MS = 2500;

export function PortfolioBuilderClient() {
  const { t } = useTranslation('tools');
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const [thesis, setThesis] = useState('');
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);
  // True for a brief hold after the real portfolio lands, before swapping
  // the loading screen out for the result — otherwise the bar hits 100%
  // and the whole screen changes in the same instant.
  const [justCompleted, setJustCompleted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();
  const invalidateQuota = useInvalidateQuota();
  const markEntityRead = useMarkEntityNotificationsRead();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // History state — expand/collapse + search
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(historyQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [historyQuery]);

  // Fetch generations — preview by default, full list when expanded or searching
  const historyFetchKey = [...HISTORY_KEY, historyExpanded || debouncedQuery ? 'all' : 'preview', debouncedQuery];
  const { data: historyData } = useQuery<{ generations: SavedGeneration[]; total?: number }>({
    queryKey: historyFetchKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set('q', debouncedQuery);
      else if (historyExpanded) params.set('all', 'true');
      const qs = params.toString();
      return fetch(`/api/ai/portfolio-builder/history${qs ? `?${qs}` : ''}`).then((r) => r.json());
    },
    staleTime: 30_000,
  });
  const history = historyData?.generations ?? [];
  const historyTotal = historyData?.total ?? history.length;

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/ai/portfolio-builder/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_KEY, exact: false }),
  });

  const reset = useCallback(() => {
    stopPolling();
    setPhase('idle');
    setResult(null);
    setErrorMessage('');
    setThesis('');
  }, [stopPolling]);

  const restoreGeneration = useCallback((gen: SavedGeneration) => {
    setResult({ type: 'done', portfolio: gen.portfolio, logoMap: gen.logoMap, replacedTickers: gen.replacedTickers, createdAt: gen.createdAt });
    setThesis(gen.thesis);
    setPhase('done');
  }, []);

  const pollStatus = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/portfolio-builder?id=${id}`);
        const data: StatusResponse = await res.json();
        if (!data.success) return;

        if (data.phase) setPhase(data.phase);

        if (data.status === 'done' && data.portfolio) {
          stopPolling();
          setResult({ type: 'done', portfolio: data.portfolio, logoMap: data.logoMap ?? {}, replacedTickers: data.replacedTickers ?? [], createdAt: data.createdAt });
          invalidateQuota('portfolio_builder');
          queryClient.invalidateQueries({ queryKey: HISTORY_KEY, exact: false });
          // Generated while the user was watching — clear its notification
          // now instead of leaving it unread until the bell is opened.
          markEntityRead.mutate(`portfolio_builder:${id}`);
          setJustCompleted(true);
          setTimeout(() => {
            setJustCompleted(false);
            setPhase('done');
          }, 1650);
        } else if (data.status === 'error') {
          stopPolling();
          setErrorCode(data.errorCode ?? 'unknown');
          setErrorMessage(data.errorMessage ?? '');
          setPhase('error');
        }
      } catch {
        // Transient network hiccup — keep polling, the next tick will retry.
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, invalidateQuota, queryClient, markEntityRead]);

  // On mount: load a specific generation from a notification deep link
  // (?id=...), or resume polling if the user left mid-build and came back.
  useEffect(() => {
    let cancelled = false;
    const linkedId = searchParams.get('id');

    (async () => {
      if (linkedId) {
        try {
          const res = await fetch(`/api/ai/portfolio-builder?id=${linkedId}`);
          const data: StatusResponse = await res.json();
          if (cancelled || !data.success) return;
          setThesis(data.thesis ?? '');
          if (data.status === 'done' && data.portfolio) {
            setResult({ type: 'done', portfolio: data.portfolio, logoMap: data.logoMap ?? {}, replacedTickers: data.replacedTickers ?? [], createdAt: data.createdAt });
            setPhase('done');
            // Landed here from a notification — the result is already on
            // screen, so clear its unread notification.
            markEntityRead.mutate(`portfolio_builder:${linkedId}`);
          } else if (data.status === 'pending') {
            setPhase(data.phase ?? 'streaming');
            pollStatus(linkedId);
          } else if (data.status === 'error') {
            setErrorCode(data.errorCode ?? 'unknown');
            setErrorMessage(data.errorMessage ?? '');
            setPhase('error');
          }
        } catch { /* fall through to idle */ }
        return;
      }

      try {
        const res = await fetch('/api/ai/portfolio-builder');
        const data = await res.json();
        if (cancelled || !data?.success || !data.pendingId) return;
        setThesis(data.pendingThesis ?? '');
        setPhase((data.pendingPhase as BuilderPhase) ?? 'streaming');
        pollStatus(data.pendingId);
      } catch { /* stay idle */ }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (submittedThesis: string) => {
    stopPolling();
    setPhase('streaming');
    setJustCompleted(false);
    setResult(null);
    setErrorMessage('');
    setThesis(submittedThesis);

    try {
      const res = await fetch('/api/ai/portfolio-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis: submittedThesis }),
      });

      if (res.status === 429) { setErrorCode('rate_limited'); setPhase('error'); return; }
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setPaywallQuota((data?.quota as QuotaState | undefined) ?? null);
        setPhase('idle');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || t('portfolioBuilderRequestFailed', { status: res.status }));
        setErrorCode('unknown');
        setPhase('error');
        return;
      }

      const data = await res.json();
      if (!data.id) { setErrorMessage(t('portfolioBuilderFailedToStart')); setErrorCode('unknown'); setPhase('error'); return; }
      pollStatus(data.id);
    } catch (err) {
      setErrorMessage((err as Error).message ?? '');
      setErrorCode('unknown');
      setPhase('error');
    }
  };

  if (phase === 'idle') {
    return (
      <div className="space-y-10">
        <ThesisInput onSubmit={submit} />
        <div className="-mt-6 flex justify-center">
          <QuotaIndicator feature="portfolio_builder" unit={{ singular: t('portfolioBuilderUnitSingular'), plural: t('portfolioBuilderUnitPlural') }} />
        </div>
        {(historyTotal > 0 || debouncedQuery) && (
          <RecentPortfolios
            items={history}
            total={historyTotal}
            expanded={historyExpanded}
            onToggleExpanded={() => setHistoryExpanded((v) => !v)}
            query={historyQuery}
            onQueryChange={setHistoryQuery}
            onRestore={restoreGeneration}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
        <AiPaywallDialog
          open={paywallQuota !== null}
          onOpenChange={(o) => !o && setPaywallQuota(null)}
          featureName={t('portfolioBuilderTitle')}
          quota={paywallQuota ?? undefined}
        />
      </div>
    );
  }

  if (phase === 'done' && result) {
    return (
      <PortfolioResult
        portfolio={result.portfolio}
        logoMap={result.logoMap}
        replacedTickers={result.replacedTickers}
        thesis={thesis}
        createdAt={result.createdAt}
        onReset={reset}
      />
    );
  }

  if (phase === 'error') {
    return (
      <Card className="border-red-500/30 bg-red-500/[0.02]">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">{errorTitle(errorCode, t)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{errorBody(errorCode, errorMessage, t)}</p>
              <div className="mt-4 flex gap-2">
                <Button onClick={reset} size="sm" variant="outline">{t('tryAgainButton')}</Button>
                {errorCode === 'rate_limited' && (
                  <Link href="/upgrade" className="inline-flex items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
                    {t('portfolioBuilderLearnAboutPro')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const builderPhase = phase as BuilderPhase;
  const builderPhaseLabels = getBuilderPhaseLabels(t);
  return (
    <ProcessingScreen
      phase={{
        index: BUILDER_PHASE_ORDER[builderPhase],
        total: builderPhaseLabels.length,
        label: builderPhaseLabels[BUILDER_PHASE_ORDER[builderPhase]],
      }}
      subtext={t('portfolioBuilderProcessingSubtext')}
      complete={justCompleted}
      leavePageHint
    />
  );
}

// ── Recent portfolios list ────────────────────────────────────────────────────

function RecentPortfolios({
  items,
  total,
  expanded,
  query,
  onToggleExpanded,
  onQueryChange,
  onRestore,
  onDelete,
}: {
  items: SavedGeneration[];
  total: number;
  expanded: boolean;
  query: string;
  onToggleExpanded: () => void;
  onQueryChange: (q: string) => void;
  onRestore: (gen: SavedGeneration) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('tools');
  const isSearching = query.trim().length > 0;
  const showSearch = expanded || isSearching;
  const hasMore = total > items.length && !isSearching;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3.5 w-3.5 text-muted-foreground/85" />
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold">
          {isSearching ? t('portfolioBuilderMatchingPortfolios') : t('portfolioBuilderRecentPortfolios')}
        </span>
        {total > 0 && (
          <span className="text-[11px] text-muted-foreground/80 tabular-nums">
            ({total})
          </span>
        )}
      </div>

      {showSearch && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/80 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('portfolioBuilderSearchPlaceholder')}
            className="w-full rounded-lg border border-border/50 bg-card/50 pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-border focus:bg-card transition-colors"
            autoFocus
          />
          {query && (
            <button
              onClick={() => onQueryChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/80 hover:text-muted-foreground p-1"
              aria-label={t('heatmapClearSearch')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((gen) => (
          <RecentPortfolioRow
            key={gen.id}
            gen={gen}
            onRestore={onRestore}
            onDelete={onDelete}
          />
        ))}
        {items.length === 0 && isSearching && (
          <p className="text-xs text-muted-foreground/85 italic px-1 py-3">
            {t('portfolioBuilderNoMatchQuery', { query })}
          </p>
        )}
      </div>

      {(hasMore || (expanded && !isSearching)) && (
        <button
          onClick={onToggleExpanded}
          className="mt-3 w-full text-center text-xs text-muted-foreground/80 hover:text-foreground transition-colors py-2 rounded-lg border border-dashed border-border/40 hover:border-border/70"
        >
          {expanded
            ? t('portfolioBuilderShowLess')
            : t('portfolioBuilderViewAll', { total })}
        </button>
      )}
    </div>
  );
}

function RecentPortfolioRow({
  gen,
  onRestore,
  onDelete,
}: {
  gen: SavedGeneration;
  onRestore: (gen: SavedGeneration) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('tools');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const score = gen.portfolio.confidence_score;
  const scoreColor =
    score >= 70 ? 'text-emerald-400' :
    score >= 50 ? 'text-amber-400' :
                  'text-red-400';

  const date = new Date(gen.createdAt);
  const label = formatRelative(date, t);

  return (
    <div className={cn(
      'group flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3',
      'hover:border-border/80 transition-colors',
    )}>
      <button
        className="flex-1 min-w-0 text-left"
        onClick={() => onRestore(gen)}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {gen.portfolio.theme_summary}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground/80">
          <span className={cn('font-semibold tabular-nums', scoreColor)}>
            {t('portfolioBuilderConfidenceScore', { score })}
          </span>
          <span>·</span>
          <span>{t('portfolioBuilderHoldingsCount', { count: gen.portfolio.holdings.length })}</span>
          <span>·</span>
          <span>{label}</span>
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {confirmDelete ? (
          <>
            <button
              onClick={() => onDelete(gen.id)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 transition-colors"
            >
              {t('deepDiveDeleteButton')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-muted-foreground/85 hover:text-muted-foreground px-2 py-1 transition-colors"
            >
              {t('deepDiveCancelButton')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground/80 hover:text-muted-foreground/80 p-1.5 transition-all"
              aria-label={t('deepDiveDeleteButton')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground/80 group-hover:text-muted-foreground/80 transition-colors" />
          </>
        )}
      </div>
    </div>
  );
}

function formatRelative(date: Date, t: TFunction): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('portfolioBuilderJustNow');
  if (mins < 60) return t('portfolioBuilderMinsAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('portfolioBuilderHrsAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('portfolioBuilderDaysAgo', { count: days });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function errorTitle(code: ErrorCode, t: TFunction): string {
  switch (code) {
    case 'rate_limited':         return t('portfolioBuilderErrorTitleRateLimited');
    case 'payment_required':     return t('deepDiveErrorTitlePaymentRequired');
    case 'invalid_key':          return t('deepDiveErrorTitleInvalidKey');
    case 'parse_failed':         return t('deepDiveErrorTitleParseFailed');
    case 'too_few_valid_tickers': return t('portfolioBuilderErrorTitleTooFewTickers');
    default:                     return t('deepDiveErrorTitleUnknown');
  }
}

function errorBody(code: ErrorCode, message: string, t: TFunction): string {
  switch (code) {
    case 'rate_limited':         return t('portfolioBuilderErrorBodyRateLimited');
    case 'payment_required':     return t('deepDiveErrorBodyUnavailable');
    case 'invalid_key':          return t('deepDiveErrorBodyUnavailable');
    case 'parse_failed':         return t('deepDiveErrorBodyParseFailed');
    case 'too_few_valid_tickers': return t('portfolioBuilderErrorBodyTooFewTickers');
    default:                     return message || t('deepDiveErrorBodyUnknown');
  }
}
