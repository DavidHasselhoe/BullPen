'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useAuth } from '@/hooks/use-auth';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useHoldings } from '@/hooks/use-holdings';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useMarkEntityNotificationsRead } from '@/hooks/use-notifications';
import { useInvalidateQuota } from '@/hooks/use-quota';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { DeepDiveReport } from '@/components/deep-dive/DeepDiveReport';
import { LensPicker } from '@/components/deep-dive/LensPicker';
import { ProcessingScreen } from '@/components/ui/ProcessingScreen';
import { isLens, type DeepDiveLens, type DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';
import type { QuotaState } from '@/lib/billing/quotas';

type Phase = 'loading' | 'idle' | 'generating' | 'done' | 'error';
type ErrorCode = 'parse_failed' | 'rate_limited' | 'payment_required' | 'invalid_key' | 'unknown';
export type DivePhase = 'reading_data' | 'searching' | 'reasoning' | 'composing';

const DIVE_PHASE_ORDER: Record<DivePhase, number> = { reading_data: 0, searching: 1, reasoning: 2, composing: 3 };

const POLL_INTERVAL_MS = 2500;

interface StatusResponse {
  success: boolean;
  status?: 'pending' | 'done' | 'error';
  phase?: DivePhase | null;
  report?: Report | null;
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
}

export default function DeepDivePage() {
  const { t } = useTranslation('tools');
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTicker = (params.ticker as string) ?? '';
  const symbol = rawTicker.toUpperCase();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const divePhaseLabels = [
    t('deepDivePhaseReadingData', 'Reading fundamentals…'),
    t('deepDivePhaseSearching', 'Researching the web…'),
    t('deepDivePhaseReasoning', 'Reasoning through the analysis…'),
    t('deepDivePhaseComposing', 'Composing the report…'),
  ];

  const { hasAnimatedBackground } = useBackground();
  const { level } = useExperienceLevel();
  const { data: holdings } = useHoldings();
  const { open: openAIPanel } = useAIPanel();
  const invalidateQuota = useInvalidateQuota();
  const queryClient = useQueryClient();
  const markEntityRead = useMarkEntityNotificationsRead();

  const holds = !!holdings?.some((h) => h.symbol.toUpperCase() === symbol);

  const initialLens: DeepDiveLens = (() => {
    const q = searchParams.get('lens');
    return q && isLens(q) ? q : 'full';
  })();

  const [phase, setPhase] = useState<Phase>('loading');
  const [lens, setLensState] = useState<DeepDiveLens>(initialLens);

  const setLens = useCallback((next: DeepDiveLens) => {
    setLensState(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('lens', next);
    router.replace(`/tools/deep-dive/${rawTicker}?${params.toString()}`, { scroll: false });
  }, [rawTicker, router, searchParams]);
  const [report, setReport] = useState<Report | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [genPhase, setGenPhase] = useState<DivePhase>('reading_data');
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);
  // True for a brief hold after the real report lands, before swapping the
  // loading screen out for the result — otherwise the bar hits 100% and the
  // whole screen changes in the same instant.
  const [justCompleted, setJustCompleted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback((id: string, useLens: DeepDiveLens) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/deep-dive/${rawTicker}?id=${id}`);
        const data: StatusResponse = await res.json();
        if (!data.success) return;

        if (data.phase) setGenPhase(data.phase);

        if (data.status === 'done' && data.report) {
          stopPolling();
          setReport(data.report);
          setCreatedAt(data.report.generatedAt ?? null);
          setLens(data.report.lens ?? useLens);
          invalidateQuota('deep_dive');
          queryClient.invalidateQueries({ queryKey: ['deep-dive-list'] });
          // Generated while the user was watching — clear its notification
          // now instead of leaving it unread until the bell is opened.
          markEntityRead.mutate(`${symbol}:deep_dive`);
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
  }, [rawTicker, symbol, stopPolling, invalidateQuota, queryClient, markEntityRead, setLens]);

  // On mount: show the latest saved dive, or resume polling if one is still
  // generating (e.g. the user started it, left, and came back). Skipped for
  // guests entirely — the render guard below shows a sign-in prompt instead,
  // and this would otherwise 401 silently on every guest page view.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { setPhase('idle'); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai/deep-dive/${rawTicker}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.success && data.report) {
          setReport(data.report as Report);
          setCreatedAt(data.createdAt ?? null);
          setLens((data.report as Report).lens ?? 'full');
          setPhase('done');
          // Landed here from a notification (or just revisiting) — the
          // report is already on screen, so clear its unread notification.
          markEntityRead.mutate(`${symbol}:deep_dive`);
        } else if (data?.success && data.pendingId) {
          setGenPhase((data.pendingPhase as DivePhase) ?? 'reading_data');
          setPhase('generating');
          pollStatus(data.pendingId, lens);
        } else {
          setPhase('idle');
        }
      } catch {
        if (!cancelled) setPhase('idle');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTicker, authLoading, isAuthenticated]);

  const generate = useCallback(async (useLens: DeepDiveLens) => {
    stopPolling();
    setPhase('generating');
    setJustCompleted(false);
    setGenPhase('reading_data');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/ai/deep-dive/${rawTicker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lens: useLens, experienceLevel: level, holds }),
      });

      if (res.status === 429) { setErrorCode('rate_limited'); setPhase('error'); return; }
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setPaywallQuota((data?.quota as QuotaState | undefined) ?? null);
        setPhase(report ? 'done' : 'idle');
        return;
      }
      if (!res.ok) { setErrorMessage(`Request failed: ${res.status}`); setErrorCode('unknown'); setPhase('error'); return; }

      const data = await res.json();
      if (!data.id) { setErrorMessage('Failed to start generation'); setErrorCode('unknown'); setPhase('error'); return; }
      pollStatus(data.id, useLens);
    } catch (err) {
      setErrorMessage((err as Error).message ?? '');
      setErrorCode('unknown');
      setPhase('error');
    }
  }, [rawTicker, level, holds, report, stopPolling, pollStatus]);

  const askAI = useCallback(() => {
    openAIPanel({
      context: { tickers: [symbol], label: report?.companyName ?? symbol },
      query: `I just read the AI deep dive on $${symbol}. What's the single most important thing to watch from here, and what would change the thesis?`,
    });
  }, [openAIPanel, symbol, report]);

  // Deep dives are a real-money AI call (Claude with extended thinking) —
  // gated behind auth for cost/quota reasons, not just to nudge signup.
  // Gate here, before ever hitting the API, so a guest gets a clear prompt
  // instead of a raw 401 from generate()'s fetch.
  if (!authLoading && !isAuthenticated) {
    return (
      <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
        <main className="container mx-auto max-w-3xl py-8 px-4 sm:px-6 lg:px-8">
          <Link
            href="/tools/deep-dive"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t('deepDiveAllDivesLink', 'All deep dives')}
          </Link>
          <Card>
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{t('deepDiveSignInTitle', 'Sign in to run a deep dive')}</h1>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
                {t('deepDiveSignInDescription', 'Create a free account to generate an AI deep dive: results, guidance, valuation, bull vs bear, catalysts and risks.')}
              </p>
              <div className="mt-6">
                <Button size="lg" onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/tools/deep-dive/${rawTicker}`)}`)}>
                  {t('deepDiveSignInButton', 'Sign in')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-3xl py-8 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tools/deep-dive"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t('deepDiveAllDivesLink', 'All deep dives')}
        </Link>

        {phase === 'loading' && (
          <Card><CardContent className="p-6 space-y-4">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="grid grid-cols-3 gap-2.5 pt-2">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </CardContent></Card>
        )}

        {phase === 'idle' && (
          <Card>
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{t('deepDiveTickerTitle', 'AI Deep Dive — ${{symbol}}', { symbol })}</h1>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
                {t(
                  'deepDiveIdleDescription',
                  'A senior-analyst-grade report: latest results, guidance, valuation, bull vs bear, catalysts and risks, synthesized from our data plus live web research.'
                )}
              </p>
              <div className="mt-6 flex flex-col items-center gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/85 mb-2">{t('deepDiveChooseLens', 'Choose a lens')}</p>
                  <LensPicker value={lens} onChange={setLens} />
                </div>
                <Button size="lg" onClick={() => generate(lens)} className="gap-2 rounded-full animate-ai-pill-shine">
                  <Sparkles className="h-4 w-4" /> {t('deepDiveGenerateButton', 'Generate Deep Dive')}
                </Button>
                <QuotaIndicator feature="deep_dive" unit={{ singular: 'deep dive', plural: 'deep dives' }} />
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'generating' && (
          <ProcessingScreen
            phase={{
              index: DIVE_PHASE_ORDER[genPhase],
              total: divePhaseLabels.length,
              label: divePhaseLabels[DIVE_PHASE_ORDER[genPhase]],
            }}
            subtext={t('deepDiveAnalyzingSubtext', 'Analyzing ${{symbol}}. This usually takes 20-40 seconds.', { symbol })}
            complete={justCompleted}
            leavePageHint
          />
        )}

        {phase === 'done' && report && (
          <div className="space-y-4">
            <DeepDiveReport
              report={report}
              createdAt={createdAt}
              onAsk={askAI}
              onRegenerate={() => generate(lens)}
            />
            <div className="flex flex-col items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{t('deepDiveTryAnotherAngle', 'Try another angle')}</span>
              <LensPicker value={lens} onChange={setLens} />
              <p className="text-center text-[11px] text-muted-foreground/85 max-w-sm">
                {t('deepDiveRegenerateHint', 'Pick a lens, then hit Regenerate. Regenerating uses one deep dive from your monthly quota.')}
              </p>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <Card className="border-red-500/30 bg-red-500/[0.02]">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{errorTitle(errorCode, t)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{errorBody(errorCode, errorMessage, t)}</p>
                  <div className="mt-4">
                    <Button onClick={() => generate(lens)} size="sm" className="rounded-full animate-ai-pill-shine">{t('tryAgainButton', 'Try again')}</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <AiPaywallDialog
          open={paywallQuota !== null}
          onOpenChange={(o) => !o && setPaywallQuota(null)}
          featureName={t('deepDiveFeatureName', 'Deep Dive')}
          quota={paywallQuota ?? undefined}
          previewContext={{ ticker: symbol, companyName: report?.companyName }}
        />
      </main>
    </div>
  );
}

function errorTitle(code: ErrorCode, t: TFunction): string {
  switch (code) {
    case 'rate_limited':     return t('deepDiveErrorTitleRateLimited', 'Slow down a moment');
    case 'payment_required': return t('deepDiveErrorTitlePaymentRequired', 'API credits required');
    case 'invalid_key':      return t('deepDiveErrorTitleInvalidKey', 'API key issue');
    case 'parse_failed':     return t('deepDiveErrorTitleParseFailed', 'Unexpected model response');
    default:                 return t('deepDiveErrorTitleUnknown', 'Something went wrong');
  }
}
function errorBody(code: ErrorCode, message: string, t: TFunction): string {
  switch (code) {
    case 'rate_limited':     return t('deepDiveErrorBodyRateLimited', 'You can run up to 3 deep dives per minute. Wait a moment and try again.');
    case 'payment_required': return t('deepDiveErrorBodyUnavailable', 'This AI feature is temporarily unavailable. Please try again shortly.');
    case 'invalid_key':      return t('deepDiveErrorBodyUnavailable', 'This AI feature is temporarily unavailable. Please try again shortly.');
    case 'parse_failed':     return t('deepDiveErrorBodyParseFailed', 'The model returned an unexpected response. This is usually transient. Try again.');
    default:                 return message || t('deepDiveErrorBodyUnknown', 'An unexpected error occurred. Please try again.');
  }
}
