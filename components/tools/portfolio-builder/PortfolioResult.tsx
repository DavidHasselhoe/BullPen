'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useHoldings } from '@/hooks/use-holdings';
import { SCENARIO_SHARES } from '@/lib/ai/risk-scenario-shares';
import type { QuotaState } from '@/lib/billing/quotas';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { Info, RefreshCw, ListPlus, Sparkles, Check, ExternalLink, HelpCircle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';
import { PortfolioHero } from './PortfolioHero';
import { AllocationBars } from './AllocationBars';
import { KeyRisks } from './KeyRisks';
import { BullBearCase } from './BullBearCase';
import { PortfolioNotes } from './PortfolioNotes';

interface Props {
  /** Needed to run a what-if against it; absent only on a result mid-restore. */
  generationId?: string;
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
  thesis: string;
  createdAt?: string | null;
  onReset: () => void;
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

/**
 * "What would this do to my risk?" — the built portfolio handed to the risk
 * analysis that already exists, combined with the book the reader holds.
 *
 * A built portfolio is a set of weights with no amount attached, so the one
 * thing that has to be asked is how big the addition would be. Three sizes,
 * not a free amount: the answer is a risk profile, which moves with the
 * proportion and not with the sum, and inventing a currency figure would
 * imply a precision this does not have.
 *
 * The run itself happens in the risk analysis feature, on the holdings page,
 * flagged as a what-if so it never becomes the baseline a later real analysis
 * is compared against.
 */
function RiskScenarioAction({
  generationId,
  open,
  onOpenChange,
}: {
  generationId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { t } = useTranslation('tools');
  const router = useRouter();
  const { data: holdings } = useHoldings();
  const [starting, setStarting] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);

  // Nothing to compare against without a book, and the server would refuse.
  const hasHoldings = (holdings ?? []).some((h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0);
  if (!hasHoldings) return null;

  const run = async (share: number) => {
    setStarting(share);
    setFailed(false);
    try {
      const res = await fetch('/api/holdings/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: { generationId, share } }),
      });
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setPaywallQuota((data?.quota as QuotaState | undefined) ?? null);
        onOpenChange(false);
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.id) {
        setFailed(true);
        return;
      }
      // The run is already going; the holdings page picks it up by id and
      // shows the same progress screen a normal analysis uses.
      router.push(`/holdings?riskAnalysisId=${data.id}`);
    } catch {
      setFailed(true);
    } finally {
      setStarting(null);
    }
  };

  return (
    <>
      <button
        onClick={() => onOpenChange(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ShieldAlert className="h-3 w-3" />
        {t('portfolioBuilderRiskScenarioButton')}
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('portfolioBuilderRiskScenarioTitle')}</DialogTitle>
            <DialogDescription>{t('portfolioBuilderRiskScenarioDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {SCENARIO_SHARES.map((share) => (
              <Button
                key={share}
                variant="outline"
                onClick={() => run(share)}
                disabled={starting !== null}
                className={cn('h-auto flex-col gap-0.5 py-3', starting === share && 'animate-pulse')}
              >
                <span className="text-base font-semibold tabular-nums">{share}%</span>
                {/* Wraps rather than truncates: this label is longer in most
                    languages than in English, and the grid keeps all three
                    buttons the same height whichever one grows. */}
                <span className="text-[11px] font-normal leading-tight text-muted-foreground whitespace-normal">
                  {t('portfolioBuilderRiskScenarioOfBook')}
                </span>
              </Button>
            ))}
          </div>
          {failed && (
            <p className="text-xs text-red-400">{t('portfolioBuilderRiskScenarioFailed')}</p>
          )}
        </DialogContent>
      </Dialog>

      <AiPaywallDialog
        open={paywallQuota !== null}
        onOpenChange={(o) => !o && setPaywallQuota(null)}
        featureName={t('portfolioBuilderRiskScenarioFeatureName')}
        quota={paywallQuota ?? undefined}
      />
    </>
  );
}

// Hierarchy order mirrors Risk Analysis's redesign brief: hero/summary ->
// allocation -> holdings -> risks -> bull/bear -> notes (progressive
// disclosure last), matching its space-y-7 / border-t rhythm.
export function PortfolioResult({ generationId, portfolio, logoMap, replacedTickers, thesis, createdAt, onReset }: Props) {
  const { t } = useTranslation('tools');
  const { isSimplified } = useExperienceLevel();
  const { open: openAIPanel } = useAIPanel();
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [scenarioOpen, setScenarioOpen] = useState(false);

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

      <PortfolioHero portfolio={portfolio} when={createdAt ?? new Date().toISOString()} />

      <div className="space-y-6 border-t border-border/20 pt-6">
        <div>
          <div className="mb-3 flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">{t('portfolioBuilderAllocationHeading')}</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('portfolioBuilderTierLegendAriaLabel')}
                  className="text-muted-foreground/85 hover:text-muted-foreground transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] space-y-1 text-left leading-snug bg-popover text-popover-foreground border border-border shadow-lg">
                <p className="text-xs">{t('portfolioBuilderTierLegendCore')}</p>
                <p className="text-xs">{t('portfolioBuilderTierLegendSecondary')}</p>
                <p className="text-xs">{t('portfolioBuilderTierLegendSatellite')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <AllocationBars holdings={portfolio.holdings} logoMap={logoMap} isSimplified={isSimplified} />
        </div>
        <KeyRisks risks={portfolio.key_risks} />
        <BullBearCase bullCase={portfolio.bull_case} bearCase={portfolio.bear_case} />
      </div>

      <div className="space-y-6 border-t border-border/20 pt-6">
        <PortfolioNotes portfolio={portfolio} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/20 pt-6">
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
          {generationId && (
            <RiskScenarioAction generationId={generationId} open={scenarioOpen} onOpenChange={setScenarioOpen} />
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
