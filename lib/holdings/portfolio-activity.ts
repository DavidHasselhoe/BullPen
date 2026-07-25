/**
 * Records a portfolio activity event (opened/increased/trimmed/closed) for a
 * manually-entered holding, surfaced on the profile Activity tab. Callers use
 * this fire-and-forget (`void recordPortfolioActivity(...)`) — a logging
 * failure must never block or fail the underlying holdings mutation.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { PortfolioActivity } from '@/lib/types/database';

export async function recordPortfolioActivity(
  userId: string,
  symbol: string,
  companyName: string,
  action: PortfolioActivity['action'],
  percentChange: number | null = null
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('portfolio_activity').insert({
    user_id: userId,
    symbol,
    company_name: companyName,
    action,
    percent_change: percentChange,
  });

  if (error) {
    console.warn(`[portfolio-activity] insert failed for ${symbol} (${action}):`, error.message);
  }
}
