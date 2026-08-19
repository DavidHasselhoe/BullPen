'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { Info, RefreshCw, ListPlus, Sparkles, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';
import { PortfolioHero } from './PortfolioHero';
import { AllocationBars } from './AllocationBars';
import { HoldingsList } from './HoldingsList';
import { KeyRisks } from './KeyRisks';
import { BullBearCase } from './BullBearCase';
import { PortfolioNotes } from './PortfolioNotes';

interface Props {
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
  thesis: string;
  createdAt?: string | null;
  onReset: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// [display:...] is stripped in BullpenChat before rendering — the full prompt still reaches the AI.
function buildAskBullQuery(portfolio: Portfolio, thesis: string): string {
  const tickers = portfolio.holdings.map((h) => h.ticker).join(', ');
  const topRisk = portfolio.key_risks?.[0];
  return `[display:Explain this AI portfolio]\nBull just built a thematic portfolio from my thesis "${thesis}" (${tickers}). Confidence: ${portfolio.confidence_score}/100. ${topRisk ? `Top risk flagged: ${topRisk.title} — ${topRisk.description}` : ''}\n\nCan you walk me through what this means in plain terms, and tell me what I should sanity-check before acting on it?`;
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

// Hierarchy order mirrors Risk Analysis's redesign brief: hero/summary ->
// allocation -> holdings -> risks -> bull/bear -> notes (progressive
// disclosure last), matching its space-y-7 / border-t rhythm.
export function PortfolioResult({ portfolio, logoMap, replacedTickers, thesis, createdAt, onReset }: Props) {
  const { isSimplified } = useExperienceLevel();
  const { open: openAIPanel } = useAIPanel();
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
    <div className="space-y-7">
      {replacedTickers.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs">
          <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span className="text-muted-foreground">
            <span className="text-amber-400 font-semibold">{replacedTickers.length}</span> ticker{replacedTickers.length === 1 ? '' : 's'} couldn&apos;t be verified ({replacedTickers.join(', ')}) and were swapped or omitted.
          </span>
        </div>
      )}

      <PortfolioHero portfolio={portfolio} />

      <div className="space-y-6 border-t border-border/20 pt-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Allocation</h3>
          <AllocationBars holdings={portfolio.holdings} />
        </div>
        <HoldingsList holdings={portfolio.holdings} logoMap={logoMap} isSimplified={isSimplified} />
        <KeyRisks risks={portfolio.key_risks} />
        <BullBearCase bullCase={portfolio.bull_case} bearCase={portfolio.bear_case} />
      </div>

      <div className="space-y-6 border-t border-border/20 pt-6">
        <PortfolioNotes portfolio={portfolio} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/20 pt-6">
        <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/80">
          {createdAt ? `Generated · ${formatWhen(createdAt)}` : 'Generated just now'}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openAIPanel({
              query: buildAskBullQuery(portfolio, thesis),
              context: { tickers: portfolio.holdings.map((h) => h.ticker), label: portfolio.theme_summary },
            })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Sparkles className="h-3 w-3" />
            Ask Bull about this
          </button>
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
        <p className="text-xs text-red-400 text-right -mt-4">{saveState.message}</p>
      )}
    </div>
  );
}
