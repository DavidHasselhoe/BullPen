'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { AllocationBars } from './AllocationBars';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  PieChart,
  Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { Portfolio, PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';

interface Props {
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
  onReset: () => void;
}

const SEVERITY_STYLES: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  MEDIUM: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  HIGH: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const ROLE_STYLES: Record<PortfolioHolding['role'], string> = {
  CORE: 'text-primary border-primary/40 bg-primary/10',
  SECONDARY: 'text-foreground/70 border-border bg-muted/40',
  HEDGE: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
};

export function PortfolioResult({ portfolio, logoMap, replacedTickers, onReset }: Props) {
  const confidenceColor =
    portfolio.confidence_score >= 70
      ? 'text-emerald-400'
      : portfolio.confidence_score >= 50
      ? 'text-amber-400'
      : 'text-red-400';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <Card className="border-border/60 overflow-hidden">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-[10px] font-semibold tracking-widest uppercase">
                  {portfolio.investment_horizon}
                </Badge>
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">
                  Thematic Portfolio
                </span>
              </div>
              <h2 className="text-xl font-semibold leading-tight text-foreground">
                {portfolio.theme_summary}
              </h2>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <div className={cn('text-3xl font-bold tabular-nums', confidenceColor)}>
                {portfolio.confidence_score}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                Confidence
              </span>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {portfolio.macro_thesis}
          </p>
          <p className="mt-3 text-xs italic text-muted-foreground/70">
            <span className="font-semibold not-italic text-muted-foreground/90">Confidence rationale:</span>{' '}
            {portfolio.confidence_rationale}
          </p>

          {/* Subsectors */}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {portfolio.subsectors.map((sub) => (
              <span
                key={sub}
                className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-foreground/85 bg-muted/30"
              >
                {sub}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Allocation + Holdings list */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Allocation bars */}
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <PieChart className="h-4 w-4 text-muted-foreground/60" />
              Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationBars holdings={portfolio.holdings} />
          </CardContent>
        </Card>

        {/* Holdings detail list */}
        <div className="lg:col-span-3 space-y-3">
          {replacedTickers.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
              <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">
                <span className="text-amber-400 font-semibold">{replacedTickers.length}</span> ticker{replacedTickers.length === 1 ? '' : 's'} couldn&apos;t be verified ({replacedTickers.join(', ')}) and were swapped or omitted.
              </span>
            </div>
          )}

          {portfolio.holdings.map((h) => (
            <HoldingRow key={h.ticker} holding={h} logoUrl={logoMap[h.ticker] ?? null} />
          ))}
        </div>
      </div>

      {/* Risks */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-muted-foreground/60" />
            Key Risks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {portfolio.key_risks.map((risk) => (
              <div
                key={risk.title}
                className="rounded-lg border border-border/50 bg-muted/20 p-3.5"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-sm font-semibold text-foreground">{risk.title}</h4>
                  <span
                    className={cn(
                      'text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded border shrink-0',
                      SEVERITY_STYLES[risk.severity]
                    )}
                  >
                    {risk.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                {risk.affected_holdings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {risk.affected_holdings.map((tk) => (
                      <span key={tk} className="font-mono text-[10px] text-muted-foreground/70">
                        {tk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bull / Bear cases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              Bull Case
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {portfolio.bull_case.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed">
                  <span className="text-emerald-400/70 shrink-0 font-mono text-xs mt-0.5">{i + 1}.</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-400">
              <TrendingDown className="h-4 w-4" />
              Bear Case
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {portfolio.bear_case.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed">
                  <span className="text-red-400/70 shrink-0 font-mono text-xs mt-0.5">{i + 1}.</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Footer: diversification + rebalance trigger */}
      <Card className="border-border/60">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Compass className="h-4 w-4 text-muted-foreground/60" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                  Diversification
                </span>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                {portfolio.diversification_analysis}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground/60" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                  Rebalance Trigger
                </span>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                {portfolio.rebalance_trigger}
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/40 select-none">
              Constructed by Claude Sonnet 4.6. Not investment advice — independent research is required.
            </p>
            <Button variant="outline" size="sm" onClick={onReset} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              New Thesis
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HoldingRow({
  holding,
  logoUrl,
}: {
  holding: PortfolioHolding;
  logoUrl: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="pt-3.5 pb-3.5">
        <div className="flex items-center gap-3">
          <Link
            href={slugToAssetPath(holding.ticker)}
            className="shrink-0"
          >
            <CompanyLogo
              ticker={holding.ticker}
              name={holding.company}
              logoUrl={logoUrl}
              size={40}
            />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={slugToAssetPath(holding.ticker)}
                className="font-mono text-sm font-bold text-foreground hover:text-primary transition-colors"
              >
                {holding.ticker}
              </Link>
              <span
                className={cn(
                  'text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded border',
                  ROLE_STYLES[holding.role]
                )}
              >
                {holding.role}
              </span>
              <span className="text-xs text-muted-foreground/60">{holding.exchange}</span>
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {holding.company} · {holding.sector}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums text-foreground leading-none">
                {holding.allocation_pct}%
              </div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mt-1 font-semibold">
                Exposure {holding.thesis_exposure_score}/10
              </div>
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3.5 pt-3.5 border-t border-border/30 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1">
                Rationale
              </p>
              <p className="text-sm text-foreground/85 leading-relaxed">{holding.rationale}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                  Key Risk
                </p>
                <span
                  className={cn(
                    'text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded border',
                    SEVERITY_STYLES[holding.risk_level]
                  )}
                >
                  {holding.risk_level}
                </span>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">{holding.key_risk}</p>
            </div>
            {holding.subsector_exposure.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1.5">
                  Subsector Exposure
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {holding.subsector_exposure.map((sub) => (
                    <span
                      key={sub}
                      className="text-xs px-2 py-0.5 rounded-full border border-border/40 text-muted-foreground bg-muted/20"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
