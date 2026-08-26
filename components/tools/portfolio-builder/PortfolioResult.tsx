'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

function formatWhen(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('portfolioBuilderJustNow');
  if (mins < 60) return t('portfolioBuilderMinsAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('portfolioBuilderHrsAgo', { count: hrs });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// [display:...] is stripped in BullpenChat before rendering — the full prompt still reaches the AI.
function buildAskBullQuery(portfolio: Portfolio, thesis: string, t: TFunction): string {
  const tickers = portfolio.holdings.map((h) => h.ticker).join(', ');
  const topRisk = portfolio.key_risks?.[0];
  const riskNote = topRisk
    ? t('portfolioBuilderAskBullRiskNote', { title: topRisk.title, description: topRisk.description })
    : '';
  const summary = t('portfolioBuilderAskBullQuery', {
    thesis,
    tickers,
    confidence: portfolio.confidence_score,
    riskNote,
  });
  return `[display:${t('portfolioBuilderAskBullDisplayLabel')}]\n${summary}\n\n${t('portfolioBuilderAskBullFollowup')}`;
}

// ── Save-as-Watchlist state machine ──────────────────────────────────────────
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; listId: string }
  | { kind: 'error'; message: string };

async function saveAsWatchlist(portfolio: Portfolio, t: TFunction): Promise<{ listId: string }> {
  const listRes = await fetch('/api/watchlist/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: portfolio.theme_summary.slice(0, 60) }),
  });
  if (!listRes.ok) {
    const body = await listRes.json().catch(() => ({}));
    if (body?.error === 'upgrade_required') {
      throw new Error(t('portfolioBuilderWatchlistLimitError'));
    }
    throw new Error(body?.error ?? t('portfolioBuilderCreateWatchlistError'));
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
  const { t } = useTranslation('tools');
  const { isSimplified } = useExperienceLevel();
  const { open: openAIPanel } = useAIPanel();
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  const handleSave = async () => {
    setSaveState({ kind: 'saving' });
    try {
      const { listId } = await saveAsWatchlist(portfolio, t);
      setSaveState({ kind: 'saved', listId });
    } catch (err) {
      setSaveState({ kind: 'error', message: err instanceof Error ? err.message : t('portfolioBuilderSaveFailedError') });
    }
  };

  return (
    <div className="space-y-7">
      {replacedTickers.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs">
          <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span className="text-muted-foreground">
            <span className="text-amber-400 font-semibold">{replacedTickers.length}</span>{' '}
            {t('portfolioBuilderTickersReplaced', { count: replacedTickers.length, tickers: replacedTickers.join(', ') })}
          </span>
        </div>
      )}

      <PortfolioHero portfolio={portfolio} />

      <div className="space-y-6 border-t border-border/20 pt-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t('portfolioBuilderAllocationHeading')}</h3>
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
          {createdAt ? t('portfolioBuilderGeneratedAt', { when: formatWhen(createdAt, t) }) : t('portfolioBuilderGeneratedJustNow')}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openAIPanel({
              query: buildAskBullQuery(portfolio, thesis, t),
              context: { tickers: portfolio.holdings.map((h) => h.ticker), label: portfolio.theme_summary },
            })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Sparkles className="h-3 w-3" />
            {t('portfolioBuilderAskBullButton')}
          </button>
          {saveState.kind === 'saved' ? (
            <Link href="/watchlist" className="inline-flex">
              <Button variant="default" size="sm" className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {t('portfolioBuilderSavedButton')}
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
              {saveState.kind === 'saving' ? t('portfolioBuilderSavingButton') : t('portfolioBuilderSaveButton')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onReset} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            {t('portfolioBuilderNewThesisButton')}
          </Button>
        </div>
      </div>
      {saveState.kind === 'error' && (
        <p className="text-xs text-red-400 text-right -mt-4">{saveState.message}</p>
      )}
    </div>
  );
}
