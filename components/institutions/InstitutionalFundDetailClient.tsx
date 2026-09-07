'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { FundAvatar } from './FundAvatar';
import { Filing13FDisclaimer } from './Filing13FDisclaimer';
import { InstitutionalHoldingsPieChart } from './InstitutionalHoldingsPieChart';
import { HoldingsBarList } from './HoldingsBarList';
import { buildAllocation } from '@/lib/institutions/allocation';
import { ALLOCATION_COLORS } from '@/lib/charts/allocation-colors';
import { fmtUsd } from '@/lib/institutions/format';
import type { InstitutionalFundSummary } from '@/app/api/institutions/route';
import type { DiffableHolding, HoldingsDiff } from '@/lib/institutions/compute-diff';

interface HoldingsResponse {
  success: boolean;
  fund?: { slug: string; displayName: string; managerName: string | null; description: string | null };
  filing?: { periodOfReport: string; filedDate: string; totalValueUsd: number | null; totalPositions: number | null };
  holdings?: DiffableHolding[];
  diff?: HoldingsDiff | null;
  availableQuarters?: string[];
  error?: string;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function InstitutionalFundDetailClient({ slug }: { slug: string }) {
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

  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: ['institutions-holdings', slug],
    queryFn: async (): Promise<HoldingsResponse> => {
      const res = await fetch(`/api/institutions/${slug}/holdings`);
      return res.json();
    },
    enabled: isAuthenticated,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });

  const locked = !isAuthenticated || holdingsData?.error === 'pro_required';
  const unlocked = !locked && holdingsData?.success && !!holdingsData.holdings;

  const displayName = holdingsData?.fund?.displayName ?? fundSummary?.displayName ?? slug;
  const managerName = holdingsData?.fund?.managerName ?? fundSummary?.managerName ?? null;

  // One allocation model drives both the donut and the bar list, so a ticker's
  // color is the same in both. Memoized on the holdings array: for a fund like
  // Citadel this sorts 7000+ rows, and highlight hover state re-renders often.
  const holdings = holdingsData?.holdings;
  const allocation = useMemo(() => (holdings ? buildAllocation(holdings) : null), [holdings]);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  return (
    <div>
      <Link
        href="/discover"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Discover
      </Link>

      <div className="mb-2 flex items-center gap-3">
        <FundAvatar
          displayName={displayName}
          size={44}
          accentColor={accentColor}
          logoUrl={fundSummary?.logoUrl}
        />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{displayName}</h1>
          {managerName && <p className="text-sm text-muted-foreground/85">{managerName}</p>}
        </div>
      </div>

      {unlocked && holdingsData?.filing && (
        <p className="mb-4 text-sm text-muted-foreground">
          Filed {fmtDate(holdingsData.filing.filedDate)} for the quarter ended{' '}
          {fmtDate(holdingsData.filing.periodOfReport)} · {fmtUsd(holdingsData.filing.totalValueUsd ?? 0)} across{' '}
          {holdingsData.filing.totalPositions} positions
        </p>
      )}

      <div className="mb-6">
        <Filing13FDisclaimer />
      </div>

      {locked && (
        <div className="rounded-xl border border-border/50 bg-card/40 p-8 text-center">
          <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground/70" aria-hidden />
          <p className="mb-1 font-medium text-foreground">Full holdings are a Pro feature</p>
          <p className="mb-4 text-sm text-muted-foreground">
            {fundSummary?.lastFiledDate
              ? `Last filed ${fmtDate(fundSummary.lastFiledDate)} · ${fundSummary.totalPositions ?? '—'} positions`
              : 'See every position, sized by portfolio weight, updated every quarter.'}
          </p>
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.97]"
          >
            Unlock full holdings
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
            highlightedKey={highlightedKey}
            onHighlight={setHighlightedKey}
            className="mb-6"
          />
          <HoldingsBarList
            allocation={allocation}
            diff={holdingsData?.diff}
            highlightedKey={highlightedKey}
            onHighlight={setHighlightedKey}
          />
        </>
      )}

      <AiPaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        featureName="Institutional Holdings"
        quota={{ allowed: false, used: 0, limit: 0, period: 'month', resetsAt: new Date().toISOString(), reason: 'pro_only' }}
        previewContext={{ fundName: displayName }}
      />
    </div>
  );
}
