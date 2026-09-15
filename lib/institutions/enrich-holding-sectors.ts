/**
 * Fill in sectors for the tickers the tracked funds hold.
 *
 * The Discover fund list sorts and filters on each fund's sector split, and
 * that split is only as good as the sector data behind it. Measured before this
 * existed: 1,513 held stocks (worth $382B across the funds' newest filings) had
 * no sector in ticker_sectors, screener_stats or companies, including AXP and
 * KO, so a fund like Viking read as 16% classified.
 *
 * Writes to ticker_sectors, the shared sector cache the holdings page already
 * reads. The weekly sync calls this after ingesting, so a new quarter's new
 * positions get a sector without anyone running a backfill.
 */

import type { createServerClient } from '@/lib/supabase/client';
import { getCompanyProfile, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import { normalizeSector } from '@/lib/finance/sector-benchmarks';

/** /profile is billed at 10 credits a call on this plan, not the 1 its docs
 *  row claimed: measured 2026-09-15 from the api-credits-used header, which
 *  rose by exactly 10 per call. Reserving 1 let the first backfill run 61
 *  calls straight into the 610/min account cap. */
const PROFILE_CREDITS = 10;

/** 50 credits a batch, well inside CRON_CREDIT_SHARE, so a sector run never
 *  crowds out the other crons sharing the per-minute budget. */
const BATCH_SIZE = 5;

export interface EnrichSectorsResult {
  candidates: number;
  resolved: number;
  /** TwelveData answered but had no sector (SPACs, some ADRs, delisted names). */
  noSector: number;
  failed: number;
  /** Stopped early on a rate limit; the rest waits for the next run. */
  rateLimited: boolean;
}

/**
 * ponytail: a ticker TwelveData has no sector for is asked again on every run,
 * since ticker_sectors cannot hold a null. `limit` bounds that to a fixed
 * credit spend per run; record misses in their own table if it ever matters.
 */
export async function enrichHoldingSectors(
  supabase: ReturnType<typeof createServerClient>,
  { limit = 300 }: { limit?: number } = {}
): Promise<EnrichSectorsResult> {
  const { data, error } = await supabase.rpc('institutional_symbols_missing_sector', { p_limit: limit });
  if (error) throw new Error(`institutional_symbols_missing_sector failed: ${error.message}`);

  const symbols = ((data as { symbol: string }[] | null) ?? []).map((r) => r.symbol);
  const result: EnrichSectorsResult = { candidates: symbols.length, resolved: 0, noSector: 0, failed: 0, rateLimited: false };

  for (let i = 0; i < symbols.length && !result.rateLimited; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    await waitForCronCreditBudget(batch.length * PROFILE_CREDITS);

    await Promise.all(
      batch.map(async (symbol) => {
        try {
          const sector = normalizeSector((await getCompanyProfile(symbol)).sector);
          if (!sector) {
            result.noSector++;
            return;
          }
          const { error: upsertError } = await supabase
            .from('ticker_sectors')
            .upsert({ ticker: symbol, sector, updated_at: new Date().toISOString() } as never, { onConflict: 'ticker' });
          if (upsertError) result.failed++;
          else result.resolved++;
        } catch (err) {
          if (err instanceof TwelveDataRateLimitError) result.rateLimited = true;
          else result.failed++;
        }
      })
    );
  }

  return result;
}
