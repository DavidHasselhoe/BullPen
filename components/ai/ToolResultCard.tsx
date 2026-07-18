'use client';

import { HealthScoreResultCard, type HealthScoreOutput } from './cards/HealthScoreResultCard';
import { LiveQuoteResultCard, type LiveQuoteOutput } from './cards/LiveQuoteResultCard';
import { KeyStatisticsResultCard, type KeyStatisticsOutput } from './cards/KeyStatisticsResultCard';
import { CompanyProfileResultCard, type CompanyProfileOutput } from './cards/CompanyProfileResultCard';
import { CompanyFinancialsResultCard, type CompanyFinancialsRow } from './cards/CompanyFinancialsResultCard';
import { EarningsResultCard, type EarningsRow } from './cards/EarningsResultCard';

/**
 * Dispatches a completed AI tool call to its matching visual card instead of
 * leaving the numbers buried in prose. Falls back to `null` for tool outputs
 * it doesn't recognize (e.g. errors, chart actions, navigation results),
 * letting the assistant's text stand alone.
 *
 * Shared by BullpenChat and the in-chart AI assistant so tool results look
 * the same regardless of which surface the user is on.
 */
export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
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
      const o = output as Partial<KeyStatisticsOutput>;
      if (!o.marketCap) return null;
      return <KeyStatisticsResultCard output={o as KeyStatisticsOutput} />;
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
    default:
      return null;
  }
}
