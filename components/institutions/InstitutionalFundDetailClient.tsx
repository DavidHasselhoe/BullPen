'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { FundAvatar } from './FundAvatar';
import { Filing13FDisclaimer } from './Filing13FDisclaimer';
import { InstitutionalHoldingsPieChart } from './InstitutionalHoldingsPieChart';
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
  const fundSummary = listData?.funds?.find((f) => f.slug === slug);

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
        <FundAvatar displayName={displayName} size={44} />
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

      {unlocked && holdingsData?.holdings && (
        <>
          <InstitutionalHoldingsPieChart
            holdings={holdingsData.holdings}
            totalValueUsd={holdingsData.filing?.totalValueUsd}
            className="mb-6"
          />
          <HoldingsTable holdings={holdingsData.holdings} diff={holdingsData.diff} />
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

function HoldingsTable({ holdings, diff }: { holdings: DiffableHolding[]; diff?: HoldingsDiff | null }) {
  const changedByCusip = new Map<string, number>();
  if (diff) {
    for (const h of diff.increased) changedByCusip.set(h.cusip, h.valueChangePct);
    for (const h of diff.decreased) changedByCusip.set(h.cusip, h.valueChangePct);
  }
  const newCusips = new Set(diff?.newPositions.map((h) => h.cusip) ?? []);

  const sorted = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground/80">
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 text-right font-medium">% of Portfolio</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">QoQ Change</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const changePct = changedByCusip.get(h.cusip);
            const isNew = newCusips.has(h.cusip);
            return (
              <tr key={h.cusip} className="border-b border-border/30 transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {h.symbol && <CompanyLogo ticker={h.symbol} name={h.nameOfIssuer} size={24} />}
                    <div className="min-w-0">
                      {h.symbol ? (
                        <Link href={`/stock/${h.symbol}`} className="font-mono font-semibold text-foreground hover:text-primary">
                          {h.symbol}
                        </Link>
                      ) : (
                        <span className="text-foreground">{h.nameOfIssuer}</span>
                      )}
                      {h.symbol && (
                        <span className="ml-2 text-xs text-muted-foreground/70">{h.nameOfIssuer}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground/90">
                  {h.portfolioPct != null ? `${h.portfolioPct.toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground/90">{fmtUsd(h.valueUsd)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                  {h.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-right">
                  {isNew ? (
                    <span className="text-xs font-medium text-emerald-400">New</span>
                  ) : changePct != null ? (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-xs tabular-nums ${changePct > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {changePct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {changePct > 0 ? '+' : ''}
                      {changePct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {diff?.exited && diff.exited.length > 0 && (
            <>
              <tr>
                <td colSpan={5} className="px-4 pt-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  Exited since last quarter
                </td>
              </tr>
              {diff.exited.map((h) => (
                <tr key={`exited-${h.cusip}`} className="border-b border-border/30 opacity-60 transition-colors last:border-0 hover:bg-muted/30 hover:opacity-80">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {h.symbol && <CompanyLogo ticker={h.symbol} name={h.nameOfIssuer} size={24} />}
                      {h.symbol ? (
                        <Link href={`/stock/${h.symbol}`} className="font-mono font-semibold text-foreground hover:text-primary">
                          {h.symbol}
                        </Link>
                      ) : (
                        <span className="text-foreground">{h.nameOfIssuer}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground/60">—</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground/60">
                    {fmtUsd(h.valueUsd)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground/60">—</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-red-400">Exited</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
