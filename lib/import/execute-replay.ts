import { createServerClient } from '@/lib/supabase/client';
import { addOrUpdateHolding, sellHolding } from '@/lib/holdings/holdings-db';
import { recordPortfolioActivity } from '@/lib/holdings/portfolio-activity';
import { getHistoricalRates } from '@/lib/currency/historical-rates';
import type { ReplayPlan } from './plan-replay';

export interface ResolvedSecurityInfo {
  symbol: string;
  companyName: string;
  tradingCurrency: string | null;
  assetType: 'stock' | 'crypto' | 'commodity' | 'forex' | 'etf';
  /** The specific listing this security was resolved AND quote-verified
   *  against (see lib/import/resolve-security.ts). Persisted on the holding
   *  so a later quote re-fetch pins the same listing instead of guessing
   *  again from a bare symbol — confirmed live that guessing is genuinely
   *  ambiguous (bare "KOG" resolves to The Kroger Co., not Kongsberg
   *  Gruppen). Null for holdings where the bare symbol is unambiguous. */
  micCode: string | null;
  exchange: string | null;
}

export interface ExecuteReplayResult {
  success: boolean;
  appliedCount: number;
  totalCount: number;
  error?: string;
}

/**
 * Executes an already-validated ReplayPlan (see plan-replay.ts) against the
 * real database, in order, journaling every write to
 * `holdings_import_events` as it happens. Not wrapped in a single DB
 * transaction — Supabase JS doesn't support one across these mutations, and
 * reimplementing weighted-average-cost logic in a PL/pgSQL RPC would create
 * a second source of truth for it. A mid-way failure stops immediately,
 * marks the import 'failed' with however many ops actually applied, and
 * leaves the journal as the record an undo path can walk backwards later —
 * it does NOT roll back what already succeeded.
 */
export async function executeReplay(
  userId: string,
  importId: string,
  plan: ReplayPlan,
  bySecurityKey: Map<string, ResolvedSecurityInfo>,
  homeCurrency: string
): Promise<ExecuteReplayResult> {
  const supabase = createServerClient();

  const symbols = [...new Set(plan.ops.map((op) => op.symbol))];
  const { data: existingRows } = await supabase
    .from('user_holdings')
    .select('id, symbol')
    .eq('user_id', userId)
    .in('symbol', symbols.length > 0 ? symbols : ['']);
  const holdingIdBySymbol = new Map<string, string>((existingRows ?? []).map((r) => [r.symbol, r.id as string]));
  const preExisting = new Set(holdingIdBySymbol.keys());

  // Pre-fetch historical FX rates for every distinct trade date once, up
  // front, rather than per-transaction — avoids N sequential Frankfurter
  // round trips inside the write loop.
  const distinctDates = [...new Set(plan.ops.map((op) => op.date))];
  const ratesByDate = new Map<string, Record<string, number> | null>();
  if (homeCurrency !== 'USD') {
    await Promise.all(
      distinctDates.map(async (date) => {
        ratesByDate.set(date, await getHistoricalRates(date));
      })
    );
  }

  await supabase.from('holdings_imports').update({ status: 'committing' }).eq('id', importId).eq('user_id', userId);

  let seq = 0;
  let appliedCount = 0;

  for (const op of plan.ops) {
    const info = bySecurityKey.get(op.securityKey);
    if (!info) continue;
    const fxRate = homeCurrency === 'USD' ? 1 : (ratesByDate.get(op.date)?.[homeCurrency] ?? null);

    try {
      if (op.action === 'BUY') {
        const result = await addOrUpdateHolding(
          userId,
          {
            symbol: op.symbol,
            company_name: info.companyName,
            quantity: op.quantity,
            avg_price: op.price,
            date_purchased: op.date,
            asset_type: info.assetType,
            purchase_currency: homeCurrency,
            purchase_fx_rate: fxRate,
            trading_currency: info.tradingCurrency,
            mic_code: info.micCode,
            exchange: info.exchange,
            source: 'manual',
            brokerage_account_id: null,
            alerts_enabled: true,
          },
          { recordActivity: false, awaitLots: true }
        );
        if (!result.success || !result.holding) {
          throw new Error(result.error ?? `Failed to record buy for ${op.symbol}`);
        }
        holdingIdBySymbol.set(op.symbol, result.holding.id);

        await supabase.from('holdings_import_events').insert({
          import_id: importId,
          seq: seq++,
          source_line: op.sourceLine,
          action: 'buy',
          symbol: op.symbol,
          entity_table: 'holding_purchases',
          entity_id: result.purchaseLotId ?? null,
          holding_id: result.holding.id,
          quantity_delta: op.quantity,
        });
      } else {
        const holdingId = holdingIdBySymbol.get(op.symbol);
        if (!holdingId) throw new Error(`No holding found to sell ${op.symbol} against`);

        const result = await sellHolding(
          userId,
          holdingId,
          { quantitySold: op.quantity, salePrice: op.price, saleDate: op.date },
          { recordActivity: false }
        );
        if (!result.success || !result.sale) {
          throw new Error(result.error ?? `Failed to record sell for ${op.symbol}`);
        }

        await supabase.from('holdings_import_events').insert({
          import_id: importId,
          seq: seq++,
          source_line: op.sourceLine,
          action: 'sell',
          symbol: op.symbol,
          entity_table: 'holding_sales',
          entity_id: result.sale.id,
          holding_id: holdingId,
          quantity_delta: -op.quantity,
        });
      }
      appliedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await supabase
        .from('holdings_imports')
        .update({ status: 'failed', applied_count: appliedCount, error_message: message })
        .eq('id', importId)
        .eq('user_id', userId);
      return { success: false, appliedCount, totalCount: plan.ops.length, error: message };
    }
  }

  // One 'opened' activity event per security newly opened by this import
  // (didn't exist before, ends with a real position) — not one per
  // transaction, which would spam the feed with dozens of events for a
  // single multi-lot import.
  for (const p of plan.projections) {
    if (!preExisting.has(p.symbol) && p.finalQuantity > 1e-9) {
      const info = bySecurityKey.get(p.securityKey);
      if (info) void recordPortfolioActivity(userId, p.symbol, info.companyName, 'opened');
    }
  }

  await supabase
    .from('holdings_imports')
    .update({ status: 'done', applied_count: appliedCount, committed_at: new Date().toISOString() })
    .eq('id', importId)
    .eq('user_id', userId);

  return { success: true, appliedCount, totalCount: plan.ops.length };
}
