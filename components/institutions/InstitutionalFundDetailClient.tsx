'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { FundAvatar } from './FundAvatar';
import { Filing13FDisclaimer } from './Filing13FDisclaimer';
import { NextFilingNote } from './NextFilingNote';
import { FollowFundButton } from './FollowFundButton';
import { FundAskBullPrompts } from './FundAskBullPrompts';
import { QuarterPicker } from './QuarterPicker';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { InstitutionalHoldingsPieChart } from './InstitutionalHoldingsPieChart';
import { HoldingsBarList } from './HoldingsBarList';
import { buildAllocation, optionPositions } from '@/lib/institutions/allocation';
import { ALLOCATION_COLORS } from '@/lib/charts/allocation-colors';
import { fmtUsd } from '@/lib/institutions/format';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { intlLocale } from '@/lib/i18n/intl-locale';
import type { FundTeaser } from '@/app/api/institutions/[slug]/teaser/route';
import type { InstitutionalFundSummary } from '@/app/api/institutions/route';
import type { DiffableHolding, HoldingsDiff } from '@/lib/institutions/compute-diff';

interface HoldingsResponse {
  success: boolean;
  fund?: { slug: string; displayName: string; managerName: string | null; description: string | null };
  filing?: { periodOfReport: string; filedDate: string; totalValueUsd: number | null; totalPositions: number | null };
  holdings?: DiffableHolding[];
  diff?: HoldingsDiff | null;
  sharesHistory?: Record<string, number[]>;
  availableQuarters?: string[];
  error?: string;
}

function fmtDate(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function InstitutionalFundDetailClient({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation('discover');
  const { isAuthenticated } = useAuth();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const { data: listData } = useQuery({
    queryKey: ['institutions-fund-list'],
    queryFn: async (): Promise<{ success: boolean; funds: InstitutionalFundSummary[] }> => {
      const res = await fetch('/api/institutions');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
  const fundIndex = listData?.funds?.findIndex((f) => f.slug === slug) ?? -1;
  const fundSummary = fundIndex >= 0 ? listData?.funds?.[fundIndex] : undefined;
  // Same color the fund's card carries on Discover, so arriving here reads as
  // the same fund rather than a different page about one.
  const accentColor = fundIndex >= 0 ? ALLOCATION_COLORS[fundIndex % ALLOCATION_COLORS.length] : undefined;

  // Null means "whatever the newest filing is", which is what the route
  // returns with no quarter param and what the page loads with.
  const [quarter, setQuarter] = useState<string | null>(null);

  const { data: holdingsData, isLoading: holdingsLoading, isFetching } = useQuery({
    queryKey: ['institutions-holdings', slug, quarter],
    queryFn: async (): Promise<HoldingsResponse> => {
      const url = quarter
        ? `/api/institutions/${slug}/holdings?quarter=${quarter}`
        : `/api/institutions/${slug}/holdings`;
      const res = await fetch(url);
      return res.json();
    },
    enabled: isAuthenticated,
    retry: false,
    staleTime: 10 * 60 * 1000,
    // Keep the quarter on screen while the next one loads. Without this the
    // whole page drops to its skeleton on every change, which reads as a
    // navigation rather than as swapping one number set for another.
    placeholderData: keepPreviousData,
  });

  const locked = !isAuthenticated || holdingsData?.error === 'pro_required';

  // What a locked visitor sees above the lock: the quarter's headline and the
  // three largest holdings. Public SEC data, and the clearest pitch for the rest.
  const { data: teaser } = useQuery({
    queryKey: ['institutions-teaser', slug, i18n.language],
    queryFn: async (): Promise<(FundTeaser & { success: boolean }) | null> => {
      const res = await fetch(`/api/institutions/${slug}/teaser?lang=${encodeURIComponent(i18n.language)}`);
      return res.ok ? res.json() : null;
    },
    enabled: locked,
    staleTime: 60 * 60 * 1000,
  });
  const locale = intlLocale(i18n.language);
  const unlocked = !locked && holdingsData?.success && !!holdingsData.holdings;

  const displayName = holdingsData?.fund?.displayName ?? fundSummary?.displayName ?? slug;
  const managerName = holdingsData?.fund?.managerName ?? fundSummary?.managerName ?? null;

  // One allocation model drives both the donut and the bar list, so a ticker's
  // color is the same in both. Memoized on the holdings array: for a fund like
  // Citadel this sorts 7000+ rows, and highlight hover state re-renders often.
  const holdings = holdingsData?.holdings;
  const allocation = useMemo(() => (holdings ? buildAllocation(holdings) : null), [holdings]);
  const options = useMemo(() => (holdings ? optionPositions(holdings) : []), [holdings]);
  const optionsValue = useMemo(() => options.reduce((sum, h) => sum + h.valueUsd, 0), [options]);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  // Give the always-present "Ask Bull" button this fund's context, the same
  // way a stock page does. Capped at the top holdings: a fund like Citadel has
  // 7166 positions and the chat route rejects a body over 200 KB.
  const { setAIContext } = useAIPanel();
  const contextTickers = useMemo(
    () => (allocation?.top ?? []).map((h) => h.symbol).filter((s): s is string => !!s).slice(0, 10),
    [allocation]
  );
  useEffect(() => {
    if (contextTickers.length === 0) return;
    setAIContext({ tickers: contextTickers, label: displayName });
    return () => setAIContext(null);
  }, [contextTickers, displayName, setAIContext]);

  return (
    <div>
      <Link
        href="/discover"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('backToDiscover')}
      </Link>

      <div className="mb-2 flex items-center gap-3">
        <FundAvatar
          displayName={displayName}
          size={44}
          accentColor={accentColor}
          logoUrl={fundSummary?.logoUrl}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{displayName}</h1>
          {managerName && <p className="text-sm text-muted-foreground">{managerName}</p>}
        </div>
        <FollowFundButton slug={slug} displayName={displayName} />
      </div>

      {unlocked && holdingsData?.filing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('fundFiledSummary', {
              filed: fmtDate(holdingsData.filing.filedDate, i18n.language),
              period: fmtDate(holdingsData.filing.periodOfReport, i18n.language),
              value: fmtUsd(holdingsData.filing.totalValueUsd ?? 0),
              count: holdingsData.filing.totalPositions ?? 0,
              positions: (holdingsData.filing.totalPositions ?? 0).toLocaleString(locale),
            })}
            {options.length > 0 && t('fundFiledOptions', { value: fmtUsd(optionsValue) })}
            {/* A 13F counts an option at the value of the shares it covers.
                Read as part of the fund's size, Citadel's $700B of options
                turned a $174B book into "almost a trillion". */}
            {options.length > 0 && (
              <span className="mt-1 block text-xs">{t('fundFiledOptionsNote')}</span>
            )}
          </p>
          <QuarterPicker
            quarters={holdingsData.availableQuarters ?? []}
            value={quarter}
            onChange={setQuarter}
            busy={isFetching}
          />
        </div>
      )}

      <div className="mb-6 space-y-2">
        <NextFilingNote />
        <Filing13FDisclaimer />
      </div>

      {locked && teaser?.success && teaser.top.length > 0 && (
        <div className="mb-4 rounded-xl border border-border/50 bg-card/40 p-5">
          {teaser.headline && (
            <p className="mb-4 text-base font-medium leading-snug text-foreground">{teaser.headline}</p>
          )}
          <ul className="divide-y divide-border/30">
            {teaser.top.map((h) => (
              <li key={h.symbol ?? h.name} className="flex items-center gap-3 py-2.5">
                {h.symbol ? (
                  <CompanyLogo ticker={h.symbol} name={h.name} size={24} />
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full bg-muted/60" aria-hidden />
                )}
                {h.symbol && <span className="font-mono text-sm font-semibold text-foreground">{h.symbol}</span>}
                {/* clamp-ok: company name in a dense row */}
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{h.name}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{h.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {locked && (
        <div className="rounded-xl border border-border/50 bg-card/40 p-8 text-center">
          <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mb-1 font-medium text-foreground">{t('fundLockedTitle')}</p>
          <p className="mb-4 text-sm text-muted-foreground">
            {fundSummary?.lastFiledDate
              ? t('fundLockedLastFiled', {
                  date: fmtDate(fundSummary.lastFiledDate, i18n.language),
                  positions: fundSummary.totalPositions ?? '—',
                })
              : t('fundLockedPitch')}
          </p>
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.97]"
          >
            {t('fundUnlock')}
          </button>
        </div>
      )}

      {!locked && holdingsLoading && (
        <div className="space-y-6">
          <div className="h-[360px] rounded-xl border border-border/50 animate-shimmer" />
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-10 rounded-lg animate-shimmer" />
            ))}
          </div>
        </div>
      )}

      {unlocked && allocation && (
        <>
          <InstitutionalHoldingsPieChart
            allocation={allocation}
            totalValueUsd={holdingsData?.filing?.totalValueUsd}
            diff={holdingsData?.diff}
            sharesHistory={holdingsData?.sharesHistory}
            highlightedKey={highlightedKey}
            onHighlight={setHighlightedKey}
          />
          <FundAskBullPrompts
            fundName={displayName}
            allocation={allocation}
            diff={holdingsData?.diff}
            totalValueUsd={holdingsData?.filing?.totalValueUsd}
            positionCount={holdingsData?.filing?.totalPositions}
            className="my-6"
          />
          <HoldingsBarList
            allocation={allocation}
            options={options}
            diff={holdingsData?.diff}
            highlightedKey={highlightedKey}
            onHighlight={setHighlightedKey}
          />
        </>
      )}

      <AiPaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        featureName={t('instHeading')}
        quota={{ allowed: false, used: 0, limit: 0, period: 'month', resetsAt: new Date().toISOString(), reason: 'pro_only' }}
        previewContext={{ fundName: displayName, fundTop: teaser?.success ? teaser.top : undefined }}
      />
    </div>
  );
}
