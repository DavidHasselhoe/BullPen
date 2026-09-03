'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert, RefreshCw, AlertTriangle, Crown, Sparkles,
} from 'lucide-react';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProcessingScreen } from '@/components/ui/ProcessingScreen';
import { useAuth } from '@/hooks/use-auth';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useMarkEntityNotificationsRead } from '@/hooks/use-notifications';
import type { QuotaState } from '@/lib/billing/quotas';
import type { HoldingWithPrice } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import type { RiskAnalysis } from './risk-analysis/types';
import { RiskAnalysisResult } from './risk-analysis/RiskAnalysisResult';
import { AnalysisHistory } from './risk-analysis/AnalysisHistory';

type ErrorCode = 'invalid_key' | 'payment_required' | 'rate_limited' | 'parse_failed' | 'unknown';

// Mirrors the server's PHASE_MARKERS in app/api/holdings/risk-analysis/route.ts —
// each phase is reached only once its corresponding JSON key has actually
// landed in Claude's streamed output, so this reflects real progress.
type RiskPhase = 'scoring' | 'identifying_risks' | 'modeling_scenarios' | 'finalizing';
function getRiskPhaseLabels(t: TFunction): string[] {
  return [
    t('riskPhaseScoring'),
    t('riskPhaseIdentifyingRisks'),
    t('riskPhaseModelingScenarios'),
    t('riskPhaseFinalizing'),
  ];
}
const RISK_PHASE_ORDER: Record<RiskPhase, number> = { scoring: 0, identifying_risks: 1, modeling_scenarios: 2, finalizing: 3 };

interface StatusResponse {
  success: boolean;
  status?: 'pending' | 'done' | 'error';
  phase?: RiskPhase | null;
  analysis?: RiskAnalysis | null;
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
}

interface PortfolioRiskAnalysisProps {
  holdings: HoldingWithPrice[];
}

const POLL_INTERVAL_MS = 2500;
const HISTORY_KEY = ['risk-analysis-history'];

// ─── Ask Bull query builder ────────────────────────────────────────────────────
// [display:...] is stripped in BullpenChat before rendering — the full prompt still reaches the AI.

function buildAskBullQuery(analysis: RiskAnalysis, holdings: HoldingWithPrice[], t: TFunction): string {
  const tickers = holdings.map((h) => h.symbol).join(', ');
  const topRisks = analysis.topRisks
    ?.slice(0, 3)
    .map((r) => `- ${r.factor} (${r.severity}): ${r.description}`)
    .join('\n') ?? '';
  const recommendations = analysis.recommendations
    ?.slice(0, 3)
    .map((r) => `- ${r}`)
    .join('\n') ?? '';

  const summary = t('riskAskBullQuery', {
    tickers,
    riskLevel: analysis.riskLevel,
    score: analysis.overallRiskScore,
    topRisks,
    recommendations,
  });
  return `[display:${t('riskAskBullDisplayLabel')}]\n${summary}\n\n${t('riskAskBullFollowup')}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'loaded' | 'error';

export function PortfolioRiskAnalysis({ holdings }: PortfolioRiskAnalysisProps) {
  const { t } = useTranslation('holdings');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { open: openAIPanel } = useAIPanel();
  const searchParams = useSearchParams();
  const markEntityRead = useMarkEntityNotificationsRead();

  // Derive user's display currency from settings
  const userCurrency = useMemo((): string => {
    const s = (user?.settings as Record<string, unknown>) ?? {};
    const c = s.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c.toUpperCase();
  }, [user]);

  const [state, setState] = useState<State>('idle');
  // True for a brief hold after the real analysis lands, before swapping the
  // loading screen out for the result — otherwise the bar hits 100% and the
  // whole screen changes in the same instant.
  const [justCompleted, setJustCompleted] = useState(false);
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real backend progress — see RiskPhase above.
  const [genPhase, setGenPhase] = useState<RiskPhase>('scoring');

  const payload = useMemo(
    () => holdings.map((h) => ({
      symbol: h.symbol,
      company_name: h.company_name,
      allocation: h.allocation,
      marketValue: h.marketValue,
      quantity: h.quantity,
      dayChangePercent: h.dayChangePercent,
      unrealizedPLPercent: h.unrealizedPLPercent,
    })),
    [holdings]
  );

  // Saved analyses history
  const { data: historyData } = useQuery<{ analyses: SavedRiskAnalysis[] }>({
    queryKey: HISTORY_KEY,
    queryFn: () => fetch('/api/holdings/risk-analysis/history').then((r) => r.json()),
    staleTime: 30_000,
  });
  const history = historyData?.analyses ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/holdings/risk-analysis/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
  });

  const restoreAnalysis = useCallback(async (id: string) => {
    const res = await fetch(`/api/holdings/risk-analysis/history?id=${id}`);
    const data = await res.json();
    if (data?.analysis) {
      setAnalysis(data.analysis as RiskAnalysis);
      setRestoredFrom(data.createdAt);
      setState('loaded');
      // The user is now looking straight at this analysis — clear its
      // "ready" notification instead of leaving it unread until they
      // separately open the bell dropdown.
      markEntityRead.mutate(`risk_analysis:${id}`);
    }
  }, [markEntityRead]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/holdings/risk-analysis?id=${id}`);
        const data: StatusResponse = await res.json();
        if (!data.success) return;

        if (data.phase) setGenPhase(data.phase);

        if (data.status === 'done' && data.analysis) {
          stopPolling();
          setAnalysis(data.analysis);
          setRestoredFrom(null);
          queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
          // Generated while the user was watching — its notification would
          // otherwise sit unread until they separately opened the bell.
          markEntityRead.mutate(`risk_analysis:${id}`);
          setJustCompleted(true);
          setTimeout(() => {
            setJustCompleted(false);
            setState('loaded');
          }, 1650);
        } else if (data.status === 'error') {
          stopPolling();
          setErrorMessage(data.errorMessage || t('riskAnalysisGenericError'));
          setState('error');
        }
      } catch {
        // Transient network hiccup — keep polling, the next tick will retry.
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, queryClient, markEntityRead, t]);

  // On mount: open a specific analysis from a notification deep link
  // (?riskAnalysisId=...), or resume polling if the user left mid-run and
  // came back (or just reloaded the page).
  useEffect(() => {
    let cancelled = false;
    const linkedId = searchParams.get('riskAnalysisId');

    (async () => {
      if (linkedId) {
        await restoreAnalysis(linkedId);
        return;
      }

      try {
        const res = await fetch('/api/holdings/risk-analysis');
        const data = await res.json();
        if (cancelled || !data?.success || !data.pendingId) return;
        setGenPhase((data.pendingPhase as RiskPhase) ?? 'scoring');
        setState('loading');
        pollStatus(data.pendingId);
      } catch { /* stay idle */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze() {
    stopPolling();
    setState('loading');
    setJustCompleted(false);
    setGenPhase('scoring');
    setErrorMessage('');
    setRestoredFrom(null);
    try {
      const res = await fetch('/api/holdings/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload, currency: userCurrency }),
      });
      if (res.status === 402) {
        const data = await res.json();
        setPaywallQuota(data.quota ?? null);
        setShowPaywall(true);
        setState('idle');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || `Request failed: ${res.status}`);
        setState('error');
        return;
      }
      const data = await res.json();
      if (!data.id) throw new Error('Failed to start analysis');
      pollStatus(data.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('riskAnalysisFailedGeneric'));
      setState('error');
    }
  }

  const generatedTime = (restoredFrom ?? analysis?.generatedAt)
    ? new Date(restoredFrom ?? analysis!.generatedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <>
      <Card className="border-border/40 bg-card">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <CardHeader className="pb-3 border-b border-border/20">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-primary" />
              {t('riskAnalysisTitle')}
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Crown className="h-2 w-2" /> {t('riskAnalysisProBadge')}
              </span>
            </CardTitle>
            {state === 'loaded' && (
              <Button size="sm" variant="ghost" onClick={analyze}
                className="shrink-0 gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3 w-3" /> {t('riskAnalysisReAnalyze')}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* ── Idle ───────────────────────────────────────────────────────── */}
          {state === 'idle' && (
            <div className="space-y-6 py-2">
              <EmptyState
                pose="thinking"
                title={t('riskAnalysisEmptyTitle')}
                description={t('riskAnalysisEmptyDescription', { count: holdings.length })}
                imageSize={112}
                className="py-2"
              >
                <div className="flex justify-center">
                  <Button
                    onClick={analyze}
                    size="sm"
                    className="gap-1.5 rounded-full animate-ai-pill-shine"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> {t('riskAnalysisRunAnalysis')}
                  </Button>
                </div>
              </EmptyState>

              {history.length > 0 && (
                <div className="border-t border-border/20 pt-4">
                  <AnalysisHistory items={history} onRestore={restoreAnalysis} onDelete={(id) => deleteMutation.mutate(id)} />
                </div>
              )}
            </div>
          )}

          {/* ── Loading ─────────────────────────────────────────────────────── */}
          {state === 'loading' && (
            <ProcessingScreen
              phase={{
                index: RISK_PHASE_ORDER[genPhase],
                total: getRiskPhaseLabels(t).length,
                label: getRiskPhaseLabels(t)[RISK_PHASE_ORDER[genPhase]],
              }}
              subtext={t('riskAnalysisAnalyzingSubtext', { count: holdings.length })}
              complete={justCompleted}
              leavePageHint
            />
          )}

          {/* ── Error ───────────────────────────────────────────────────────── */}
          {state === 'error' && (
            <div className="flex flex-col items-center py-7 gap-3 text-center">
              <AlertTriangle className="h-7 w-7 text-destructive/80" />
              <p className="text-sm text-destructive/90">{errorMessage || t('riskAnalysisGenericError')}</p>
              <Button size="sm" onClick={analyze} className="gap-1.5 rounded-full animate-ai-pill-shine">
                <RefreshCw className="h-3 w-3" /> {t('riskAnalysisTryAgain')}
              </Button>
            </div>
          )}

          {/* ── Results ─────────────────────────────────────────────────────── */}
          {state === 'loaded' && analysis && (
            <RiskAnalysisResult
              analysis={analysis}
              displayedTimestamp={restoredFrom ?? analysis.generatedAt}
              history={history}
              onRestore={restoreAnalysis}
              onDelete={(id) => deleteMutation.mutate(id)}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/15 pt-4">
                  <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/80">
                    {restoredFrom
                      ? t('riskAnalysisRestoredAt', { time: generatedTime })
                      : t('riskAnalysisGeneratedAt', { time: generatedTime })}
                  </span>
                  <button
                    onClick={() => openAIPanel({
                      query: buildAskBullQuery(analysis, holdings, t),
                      context: { tickers: holdings.map((h) => h.symbol), label: t('riskAnalysisAskBullContextLabel') },
                    })}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('riskAnalysisAskBullAboutThis')}
                  </button>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>

      <AiPaywallDialog
        open={showPaywall}
        onOpenChange={setShowPaywall}
        featureName={t('riskAnalysisTitle')}
        quota={paywallQuota ?? undefined}
        previewContext={{ tickers: holdings.map((h) => h.symbol) }}
      />
    </>
  );
}
