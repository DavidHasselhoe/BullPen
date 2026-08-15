'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  Compass,
  ListPlus,
  Sparkles,
  Check,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { Portfolio, PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';

interface Props {
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
  thesis: string;
  onReset: () => void;
}

const SEVERITY_STYLES: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  MEDIUM: 'text-amber-400  border-amber-500/30  bg-amber-500/10',
  HIGH:   'text-red-400    border-red-500/30    bg-red-500/10',
};

const SEVERITY_BORDER: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    'border-l-emerald-500/60',
  MEDIUM: 'border-l-amber-500/70',
  HIGH:   'border-l-red-500/70',
};

const ROLE_STYLES: Record<PortfolioHolding['role'], string> = {
  CORE:      'text-primary      border-primary/40      bg-primary/10',
  SECONDARY: 'text-foreground/70 border-border         bg-muted/40',
  HEDGE:     'text-cyan-400     border-cyan-500/30     bg-cyan-500/10',
};

const ROLE_BORDER: Record<PortfolioHolding['role'], string> = {
  CORE:      'border-l-primary/60',
  SECONDARY: 'border-l-border',
  HEDGE:     'border-l-cyan-500/50',
};

const ROLE_PLAIN_LABEL: Record<PortfolioHolding['role'], string> = {
  CORE:      'Top pick',
  SECONDARY: 'Supporting',
  HEDGE:     'Counter-bet',
};

const SEVERITY_PLAIN_LABEL: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    'Low risk',
  MEDIUM: 'Medium risk',
  HIGH:   'High risk',
};

const HOLDING_COLORS = [
  '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#a78bfa', '#f43f5e',
  '#34d399', '#fbbf24', '#6366f1', '#ec4899', '#94a3b8', '#8b5cf6',
];

const ROLE_SORT_ORDER: Record<PortfolioHolding['role'], number> = { CORE: 0, SECONDARY: 1, HEDGE: 2 };

/** First sentence, with the trailing period preserved. Falls back to first 140 chars. */
function firstSentence(text: string): string {
  const match = text.match(/^[\s\S]*?[.!?](\s|$)/);
  if (match) return match[0].trim();
  return text.length > 140 ? `${text.slice(0, 140).trim()}…` : text;
}

// ── Confidence ring ──────────────────────────────────────────────────────────
function ConfidenceRing({ score }: { score: number }) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const arcLength = circumference * 0.75;
  const fill = arcLength * (score / 100);
  const color =
    score >= 70 ? '#34d399' :
    score >= 50 ? '#f59e0b' :
                  '#f43f5e';

  return (
    <div className="relative flex items-center justify-center h-20 w-20 shrink-0">
      <svg className="absolute inset-0 -rotate-[135deg]" viewBox="0 0 72 72" fill="none">
        <circle
          cx="36" cy="36" r={r}
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          className="text-muted/40"
        />
        <circle
          cx="36" cy="36" r={r}
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${fill} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
          {score}
        </span>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold mt-0.5">
          score
        </span>
      </div>
    </div>
  );
}

// ── Save-as-Watchlist state machine ──────────────────────────────────────────
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; listId: string }
  | { kind: 'error'; message: string };

async function saveAsWatchlist(portfolio: Portfolio): Promise<{ listId: string }> {
  const listRes = await fetch('/api/watchlist/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: portfolio.theme_summary.slice(0, 60) }),
  });
  if (!listRes.ok) {
    const body = await listRes.json().catch(() => ({}));
    if (body?.error === 'upgrade_required') {
      throw new Error('You\'ve reached the free-tier watchlist limit. Upgrade to Pro to save more.');
    }
    throw new Error(body?.error ?? 'Could not create watchlist');
  }
  const { list } = (await listRes.json()) as { list: { id: string } };

  // Add each holding sequentially — symbol regex is strict, skip silently on failures
  await Promise.allSettled(
    portfolio.holdings.map((h) =>
      fetch(`/api/watchlist/lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: h.ticker, company_name: h.company }),
      })
    )
  );

  return { listId: list.id };
}

export function PortfolioResult({ portfolio, logoMap, replacedTickers, thesis, onReset }: Props) {
  const { isSimplified } = useExperienceLevel();
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  const handleSave = async () => {
    setSaveState({ kind: 'saving' });
    try {
      const { listId } = await saveAsWatchlist(portfolio);
      setSaveState({ kind: 'saved', listId });
    } catch (err) {
      setSaveState({ kind: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Beginner "In plain terms" callout — shows on top of the deeper analysis */}
      {isSimplified && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-3 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <span className="font-semibold text-foreground">In plain terms: </span>
            <span className="text-foreground/80">{firstSentence(portfolio.macro_thesis)}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <Card className="border-border/60 overflow-hidden">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 min-w-0">
                <Badge variant="outline" className="text-[11px] font-semibold tracking-widest uppercase max-w-[200px] truncate block shrink-0">
                  {portfolio.investment_horizon}
                </Badge>
                <span className="text-[11px] text-muted-foreground/85 uppercase tracking-widest font-semibold">
                  Thematic Portfolio
                </span>
              </div>
              <h2 className="text-xl font-semibold leading-tight text-foreground">
                {portfolio.theme_summary}
              </h2>
              {thesis && (
                <p className="mt-1 text-xs text-muted-foreground/85 italic">&ldquo;{thesis}&rdquo;</p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {portfolio.macro_thesis}
              </p>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <ConfidenceRing score={portfolio.confidence_score} />
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold mt-1">
                Confidence
              </span>
            </div>
          </div>

          {/* Confidence rationale — moved out of micro-italic into a readable callout */}
          <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
                Why this confidence score
              </span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/70">
              {portfolio.confidence_rationale}
            </p>
          </div>

          {/* Subsectors */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {portfolio.subsectors.map((sub) => (
              <span
                key={sub}
                className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-foreground/80 bg-muted/30"
              >
                {sub}
              </span>
            ))}
          </div>

          {/* Compact allocation strip */}
          <AllocationStrip holdings={portfolio.holdings} />
        </CardContent>
      </Card>

      {/* Holdings list */}
      <div className="space-y-2.5">
          {replacedTickers.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs">
              <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">
                <span className="text-amber-400 font-semibold">{replacedTickers.length}</span> ticker{replacedTickers.length === 1 ? '' : 's'} couldn&apos;t be verified ({replacedTickers.join(', ')}) and were swapped or omitted.
              </span>
            </div>
          )}
          {portfolio.holdings.map((h) => (
            <HoldingRow
              key={h.ticker}
              holding={h}
              logoUrl={logoMap[h.ticker] ?? null}
              isSimplified={isSimplified}
            />
          ))}
        </div>

      {/* Risks */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-muted-foreground/80" />
            Key Risks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {portfolio.key_risks.map((risk) => (
              <div
                key={risk.title}
                className={cn(
                  'rounded-xl border border-border/50 border-l-4 bg-muted/20 p-3.5',
                  SEVERITY_BORDER[risk.severity]
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-sm font-semibold text-foreground">{risk.title}</h4>
                  <span className={cn('text-[11px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap', SEVERITY_STYLES[risk.severity])}>
                    {isSimplified ? SEVERITY_PLAIN_LABEL[risk.severity] : risk.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                {risk.affected_holdings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {risk.affected_holdings.map((tk) => (
                      <span key={tk} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/85">
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

      {/* Bull / Bear */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              {isSimplified ? 'Why this could work' : 'Bull Case'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {portfolio.bull_case.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed">
                  <span className="text-emerald-400/60 shrink-0 font-mono text-xs mt-0.5 tabular-nums">{i + 1}.</span>
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
              {isSimplified ? 'Why it could go wrong' : 'Bear Case'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {portfolio.bear_case.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed">
                  <span className="text-red-400/60 shrink-0 font-mono text-xs mt-0.5 tabular-nums">{i + 1}.</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <Card className="border-border/60">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Compass className="h-4 w-4 text-muted-foreground/80" />
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold">
                  {isSimplified ? 'How balanced is this?' : 'Diversification'}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{portfolio.diversification_analysis}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground/80" />
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold">
                  {isSimplified ? 'When to revisit' : 'Rebalance Trigger'}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{portfolio.rebalance_trigger}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground/80 select-none flex-1 min-w-[200px]">
              Constructed by Claude Sonnet 4.6. Not investment advice — independent research is required.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Save-as-watchlist with inline state feedback */}
              {saveState.kind === 'saved' ? (
                <Link href="/watchlist" className="inline-flex">
                  <Button variant="default" size="sm" className="gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Saved
                    <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={saveState.kind === 'saving'}
                  className="gap-1.5"
                >
                  <ListPlus className={cn('h-3.5 w-3.5', saveState.kind === 'saving' && 'animate-pulse')} />
                  {saveState.kind === 'saving' ? 'Saving…' : 'Save as Watchlist'}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onReset} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                New Thesis
              </Button>
            </div>
          </div>
          {saveState.kind === 'error' && (
            <p className="mt-2 text-xs text-red-400 text-right">{saveState.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Compact allocation strip (lives inside the header card) ──────────────────
function AllocationStrip({ holdings }: { holdings: PortfolioHolding[] }) {
  const sorted = [...holdings].sort((a, b) => {
    const d = ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role];
    return d !== 0 ? d : b.allocation_pct - a.allocation_pct;
  });

  return (
    <div className="mt-4 pt-4 border-t border-border/30 space-y-2.5">
      {/* Stacked proportional bar */}
      <div className="h-1.5 w-full rounded-full overflow-hidden flex">
        {sorted.map((h, i) => (
          <div
            key={h.ticker}
            style={{ width: `${h.allocation_pct}%`, backgroundColor: HOLDING_COLORS[i % HOLDING_COLORS.length] }}
            title={`${h.ticker}: ${h.allocation_pct}%`}
          />
        ))}
      </div>
      {/* Ticker grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5">
        {sorted.map((h, i) => (
          <div key={h.ticker} className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: HOLDING_COLORS[i % HOLDING_COLORS.length] }}
            />
            <span className="font-mono text-[11px] font-bold text-foreground">{h.ticker}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground/80 ml-auto">{Math.round(h.allocation_pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingRow({
  holding,
  logoUrl,
  isSimplified,
}: {
  holding: PortfolioHolding;
  logoUrl: string | null;
  isSimplified: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rationalePreview = firstSentence(holding.rationale);
  const hasMore = rationalePreview.length < holding.rationale.length;

  return (
    <Card className={cn('border-l-2 border-border/50 hover:border-border/80 transition-colors overflow-hidden', ROLE_BORDER[holding.role])}>
      <CardContent className="pt-3.5 pb-3.5">
        <div className="flex items-center gap-3">
          <Link href={slugToAssetPath(holding.ticker)} className="shrink-0">
            <CompanyLogo ticker={holding.ticker} name={holding.company} logoUrl={logoUrl} size={36} />
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
                className={cn('text-[11px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap', ROLE_STYLES[holding.role])}
                title={!isSimplified ? undefined : holding.role}
              >
                {isSimplified ? ROLE_PLAIN_LABEL[holding.role] : holding.role}
              </span>
            </div>
            <div className="text-xs text-muted-foreground/80 truncate mt-0.5">{holding.company}</div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col items-end gap-1">
              <span className="text-lg font-bold tabular-nums text-foreground leading-none">
                {Math.round(holding.allocation_pct)}%
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/50"
                    style={{ width: `${holding.allocation_pct}%` }}
                  />
                </div>
                <TermTooltip
                  term="Thesis exposure"
                  className="text-[11px] text-muted-foreground/80 tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground/80 tabular-nums">
                  {holding.thesis_exposure_score}/10
                </span>
              </div>
            </div>

            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground/80 hover:text-foreground transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Rationale preview — always visible (first sentence). Full text revealed on expand. */}
        <div className="mt-2.5 pl-[48px]">
          {!expanded ? (
            <p className="text-xs text-muted-foreground/85 leading-relaxed">
              {rationalePreview}
              {hasMore && (
                <button
                  onClick={() => setExpanded(true)}
                  className="ml-1 text-primary/80 hover:text-primary text-xs font-medium"
                >
                  Read full rationale →
                </button>
              )}
            </p>
          ) : null}
        </div>

        {expanded && (
          <div className="mt-3.5 pt-3.5 border-t border-border/30 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold mb-1.5">
                {isSimplified ? 'Why this stock' : 'Rationale'}
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">{holding.rationale}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold">
                  {isSimplified ? 'Main risk' : 'Key Risk'}
                </p>
                <span className={cn('text-[11px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap', SEVERITY_STYLES[holding.risk_level])}>
                  {isSimplified ? SEVERITY_PLAIN_LABEL[holding.risk_level] : holding.risk_level}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{holding.key_risk}</p>
            </div>
            {holding.subsector_exposure.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold mb-1.5">
                  {isSimplified ? 'Areas of the market' : 'Subsector Exposure'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {holding.subsector_exposure.map((sub) => (
                    <span key={sub} className="text-xs px-2 py-0.5 rounded-full border border-border/40 text-muted-foreground bg-muted/20">
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
