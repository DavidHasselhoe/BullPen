'use client';

import { HealthScoreResultCard, type HealthScoreOutput } from './cards/HealthScoreResultCard';
import { LiveQuoteResultCard, type LiveQuoteOutput } from './cards/LiveQuoteResultCard';
import { KeyStatisticsResultCard, type KeyStatisticsOutput } from './cards/KeyStatisticsResultCard';
import { CompanyProfileResultCard, type CompanyProfileOutput } from './cards/CompanyProfileResultCard';
import { CompanyFinancialsResultCard, type CompanyFinancialsRow } from './cards/CompanyFinancialsResultCard';
import { EarningsResultCard, type EarningsRow } from './cards/EarningsResultCard';
import { ScreenerResultCard, type ScreenerOutput } from './cards/ScreenerResultCard';
import { CompanyMetricsResultCard, type CompanyMetricsOutput } from './cards/CompanyMetricsResultCard';
import { InsiderActivityResultCard, type InsiderActivityOutput } from './cards/InsiderActivityResultCard';
import { ActionReceiptCard } from './cards/ActionReceiptCard';
import type { ClientAction, ActionOutcome } from '@/lib/ai/tool-ux';

/**
 * Dispatches a completed AI tool call to its matching visual card instead of
 * leaving the numbers buried in prose. Falls back to `null` for tool outputs
 * it doesn't recognize (e.g. errors, chart actions, navigation results),
 * letting the assistant's text stand alone.
 *
 * Shared by BullpenChat and the in-chart AI assistant so tool results look
 * the same regardless of which surface the user is on.
 */

interface SiblingCall {
  toolName: string;
  output: unknown;
}

/** Finds a live price for `ticker` from a sibling getLiveQuote call in the same message, if any. */
function resolveLivePrice(siblingCalls: SiblingCall[] | undefined, ticker: string | undefined): number | null {
  if (!siblingCalls || !ticker) return null;
  for (const call of siblingCalls) {
    if (call.toolName !== 'getLiveQuote') continue;
    const o = call.output as { ticker?: string; priceRaw?: number | null } | null;
    if (o && o.ticker === ticker && typeof o.priceRaw === 'number') return o.priceRaw;
  }
  return null;
}

export function ToolResultCard({
  toolName,
  output,
  siblingCalls,
  clientAction,
  actionOutcome,
  isHistorical,
  onRetryAction,
}: {
  toolName: string;
  output: unknown;
  /** Every completed tool call in the same message — used for cross-call lookups. */
  siblingCalls?: SiblingCall[];
  /** Present only when this call is a write-action (addHolding/updateHolding/removeHolding/createAlert/navigate). */
  clientAction?: ClientAction;
  actionOutcome?: ActionOutcome;
  isHistorical?: boolean;
  onRetryAction?: () => void;
}) {
  if (clientAction && clientAction.type !== 'navigate') {
    return (
      <ActionReceiptCard
        action={clientAction}
        outcome={actionOutcome}
        isHistorical={!!isHistorical}
        onRetry={onRetryAction}
      />
    );
  }

  if (!output || typeof output !== 'object') return null;
  if ('error' in (output as Record<string, unknown>)) return null;

  switch (toolName) {
    case 'getHealthScore': {
      const o = output as Partial<HealthScoreOutput>;
      if (!o.categories || typeof o.score !== 'number') return null;
      return <HealthScoreResultCard output={o as HealthScoreOutput} />;
    }
    case 'getLiveQuote': {
      const o = output as Partial<LiveQuoteOutput>;
      if (!o.price || !o.changePercent) return null;
      return <LiveQuoteResultCard output={o as LiveQuoteOutput} />;
    }
    case 'getKeyStatistics': {
      const o = output as Partial<KeyStatisticsOutput> & { ticker?: string };
      if (!o.marketCap) return null;
      return <KeyStatisticsResultCard output={o as KeyStatisticsOutput} livePrice={resolveLivePrice(siblingCalls, o.ticker)} />;
    }
    case 'getCompanyProfile':
    case 'getLiveCompanyProfile': {
      const o = output as Partial<CompanyProfileOutput>;
      if (!o.name) return null;
      return <CompanyProfileResultCard output={o as CompanyProfileOutput} />;
    }
    case 'getCompanyFinancials': {
      if (!Array.isArray(output)) return null;
      return <CompanyFinancialsResultCard output={output as CompanyFinancialsRow[]} />;
    }
    case 'getEarningsData': {
      if (!Array.isArray(output)) return null;
      return <EarningsResultCard output={output as EarningsRow[]} />;
    }
    case 'screenCompanies': {
      const o = output as Partial<ScreenerOutput>;
      if (!Array.isArray(o.companies)) return null;
      return <ScreenerResultCard output={o as ScreenerOutput} />;
    }
    case 'getCompanyMetrics': {
      const o = output as Partial<CompanyMetricsOutput>;
      if (!Array.isArray(o.rows) || o.rows.length === 0) return null;
      return <CompanyMetricsResultCard output={o as CompanyMetricsOutput} />;
    }
    case 'getInsiderActivity': {
      const o = output as Partial<InsiderActivityOutput>;
      if (!o.tradeCount) return null;
      return <InsiderActivityResultCard output={o as InsiderActivityOutput} />;
    }
    default:
      return null;
  }
}
