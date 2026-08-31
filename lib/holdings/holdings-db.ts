// Holdings Database Operations
// Server-side database operations for user holdings

import { createServerClient } from '@/lib/supabase/client';
import type { UserHolding, InsertUserHolding, UpdateUserHolding, HoldingSale, InsertHoldingSale, HoldingPurchase, InsertHoldingPurchase } from '@/lib/types/database';
import { logger } from '@/lib/utils/logger';
import { getCompanyProfile } from '@/lib/twelvedata/twelvedata-client';
import { recordPortfolioActivity } from '@/lib/holdings/portfolio-activity';
import { getLogoUrlsForTickers } from '@/lib/logos/logos-db';

/** Cap how many profiles we resolve per fetch so a fresh portfolio doesn't burst the API. */
const MAX_CURRENCY_BACKFILL = 25;

/**
 * Fills in `trading_currency` for holdings that don't have it yet (legacy rows,
 * brokerage-synced positions, or any add path that didn't capture it). Resolves
 * the asset's listing currency from the TwelveData profile, persists it so this
 * only runs once per holding, and returns the holdings enriched for immediate display.
 *
 * Never throws — on any failure the holding keeps a null currency (UI falls back to
 * USD) and we retry on a later fetch.
 */
async function backfillTradingCurrencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  holdings: UserHolding[]
): Promise<UserHolding[]> {
  const missing = [
    ...new Set(holdings.filter((h) => !h.trading_currency).map((h) => h.symbol.toUpperCase())),
  ].slice(0, MAX_CURRENCY_BACKFILL);
  if (missing.length === 0) return holdings;

  const resolved = new Map<string, string>();
  await Promise.allSettled(
    missing.map(async (sym) => {
      const profile = await getCompanyProfile(sym);
      if (profile?.currency) resolved.set(sym, profile.currency);
    })
  );
  if (resolved.size === 0) return holdings;

  // Persist fire-and-forget — we already have the values for this response.
  void Promise.allSettled(
    [...resolved].map(([sym, cur]) =>
      supabase
        .from('user_holdings')
        .update({ trading_currency: cur })
        .eq('user_id', userId)
        .eq('symbol', sym)
    )
  );

  return holdings.map((h) =>
    h.trading_currency
      ? h
      : { ...h, trading_currency: resolved.get(h.symbol.toUpperCase()) ?? null }
  );
}

export interface GetHoldingsResult {
  success: boolean;
  holdings?: UserHolding[];
  error?: string;
}

export interface AddHoldingResult {
  success: boolean;
  holding?: UserHolding;
  error?: string;
  /** id of the holding_purchases lot this call created, when awaitLots is set. */
  purchaseLotId?: string;
}

/**
 * Shared opt-in behavior overrides for the bulk-import replay path.
 * Both default to today's existing behavior, so no existing caller changes:
 *  - recordActivity: whether to fire the social-feed 'opened'/'increased'
 *    event. A 54-transaction import would otherwise spam ~54 feed events;
 *    the caller emits its own single summary event per security instead.
 *  - awaitLots: recordHoldingPurchase is normally fire-and-forget (`void`)
 *    and swallows its own errors — fine for one interactive add, but a
 *    replay of many transactions in quick succession risks a race between
 *    the lot insert and the next quantity update. Import awaits and
 *    surfaces failures instead.
 */
export interface HoldingMutationOpts {
  recordActivity?: boolean;
  awaitLots?: boolean;
}

export interface UpdateHoldingResult {
  success: boolean;
  holding?: UserHolding;
  error?: string;
}

export interface RemoveHoldingResult {
  success: boolean;
  error?: string;
}

/**
 * Get all holdings for a user
 */
export async function getHoldings(userId: string): Promise<GetHoldingsResult> {
  try {
    const supabase = createServerClient();

    const { data: holdings, error } = await supabase
      .from('user_holdings')
      .select('id, user_id, symbol, company_name, quantity, avg_price, date_purchased, asset_type, source, brokerage_account_id, alerts_enabled, purchase_currency, purchase_fx_rate, trading_currency, mic_code, exchange, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching holdings:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch holdings',
      };
    }

    // Fill in any missing trading currencies (legacy/synced rows) so Avg Price can be
    // labeled in the asset's native currency, and attach logo_url from `companies` —
    // both best-effort, run in parallel, and never block the response. Attaching the
    // logo here means it arrives with the first holdings fetch instead of the second,
    // dependent client-side query that used to gate it (see HoldingsTable/holdings page).
    let result = holdings as UserHolding[];
    const tickers = [...new Set(result.map((h) => h.symbol.toUpperCase()))];

    const [backfilled, logoUrls] = await Promise.all([
      backfillTradingCurrencies(supabase, userId, result).catch((err) => {
        logger.warn('trading_currency backfill skipped:', err);
        return result;
      }),
      getLogoUrlsForTickers(tickers),
    ]);

    result = backfilled.map((h) => ({
      ...h,
      logo_url: logoUrls.get(h.symbol.toUpperCase()) ?? null,
    }));

    return {
      success: true,
      holdings: result,
    };
  } catch (error) {
    logger.error('Error in getHoldings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Records one purchase lot for a holding — inserted by both addHolding (the
 * initial buy) and addOrUpdateHolding (every subsequent top-up), so every
 * discrete buy event gets its own row for accurate multi-dot chart markers.
 * Best-effort: logs and swallows errors rather than failing the parent
 * mutation, same fire-and-forget pattern as recordPortfolioActivity.
 */
async function recordHoldingPurchase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  holding: {
    id: string;
    symbol: string;
    company_name: string;
    purchase_currency?: string | null;
    purchase_fx_rate?: number | null;
    trading_currency?: string | null;
    asset_type?: string | null;
  },
  lot: { quantity: number; price: number; purchaseDate: string }
): Promise<{ id: string } | null> {
  const insert: Omit<InsertHoldingPurchase, 'id'> = {
    user_id: userId,
    holding_id: holding.id,
    symbol: holding.symbol,
    company_name: holding.company_name,
    quantity: lot.quantity,
    price: lot.price,
    purchase_date: lot.purchaseDate,
    purchase_currency: holding.purchase_currency ?? null,
    purchase_fx_rate: holding.purchase_fx_rate ?? null,
    trading_currency: holding.trading_currency ?? null,
    asset_type: holding.asset_type ?? null,
  };
  const { data, error } = await supabase.from('holding_purchases').insert(insert).select('id').single();
  if (error) {
    logger.error('Error recording holding purchase lot:', error);
    return null;
  }
  return { id: data.id as string };
}

/**
 * Add a new holding for a user
 */
export async function addHolding(
  userId: string,
  holding: Omit<InsertUserHolding, 'user_id'>,
  opts: HoldingMutationOpts = {}
): Promise<AddHoldingResult> {
  const { recordActivity = true, awaitLots = false } = opts;
  try {
    const supabase = createServerClient();

    // Validate input
    if (!holding.symbol || !holding.company_name) {
      return {
        success: false,
        error: 'Symbol and company name are required',
      };
    }

    // Check if holding already exists (unique constraint on user_id, symbol)
    const { data: existing } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', holding.symbol.toUpperCase())
      .single();

    if (existing) {
      return {
        success: false,
        error: 'Holding already exists for this stock',
      };
    }

    // Insert new holding
    const h = holding as {
      date_purchased?: string | null;
      asset_type?: string | null;
      purchase_currency?: string | null;
      purchase_fx_rate?: number | null;
      trading_currency?: string | null;
      mic_code?: string | null;
      exchange?: string | null;
    };
    const { data: newHolding, error: insertError } = await supabase
      .from('user_holdings')
      .insert({
        user_id: userId,
        symbol: holding.symbol.toUpperCase(),
        company_name: holding.company_name,
        quantity: holding.quantity || null,
        avg_price: holding.avg_price || null,
        date_purchased: h.date_purchased ?? null,
        asset_type: h.asset_type ?? 'stock',
        purchase_currency: h.purchase_currency ?? 'USD',
        purchase_fx_rate: h.purchase_fx_rate ?? null,
        trading_currency: h.trading_currency ?? null,
        mic_code: h.mic_code ?? null,
        exchange: h.exchange ?? null,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error adding holding:', insertError);
      return {
        success: false,
        error: insertError.message || 'Failed to add holding',
      };
    }

    if (recordActivity) {
      void recordPortfolioActivity(userId, newHolding.symbol, newHolding.company_name, 'opened');
    }

    let purchaseLotId: string | undefined;
    if (newHolding.quantity != null && newHolding.quantity > 0 && newHolding.avg_price != null && newHolding.avg_price > 0) {
      const lot = {
        quantity: newHolding.quantity,
        price: newHolding.avg_price,
        purchaseDate: newHolding.date_purchased ?? new Date().toISOString().slice(0, 10),
      };
      if (awaitLots) {
        const inserted = await recordHoldingPurchase(supabase, userId, newHolding as UserHolding, lot);
        purchaseLotId = inserted?.id;
      } else {
        void recordHoldingPurchase(supabase, userId, newHolding as UserHolding, lot);
      }
    }

    return {
      success: true,
      holding: newHolding as UserHolding,
      purchaseLotId,
    };
  } catch (error) {
    logger.error('Error in addHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Add or update a holding — if the symbol already exists, adds to quantity (and optionally
 * updates avg_price with weighted average). Use for "add 5 more shares" semantics.
 */
export async function addOrUpdateHolding(
  userId: string,
  holding: Omit<InsertUserHolding, 'user_id'>,
  opts: HoldingMutationOpts = {}
): Promise<AddHoldingResult> {
  const { recordActivity = true, awaitLots = false } = opts;
  try {
    const supabase = createServerClient();

    if (!holding.symbol || !holding.company_name) {
      return {
        success: false,
        error: 'Symbol and company name are required',
      };
    }

    const { data: existing } = await supabase
      .from('user_holdings')
      .select('id, quantity, avg_price, date_purchased, purchase_currency, purchase_fx_rate, trading_currency, asset_type, mic_code, exchange')
      .eq('user_id', userId)
      .eq('symbol', holding.symbol.toUpperCase())
      .maybeSingle();

    if (existing) {
      const existingQty = existing.quantity ?? 0;
      const addQty = holding.quantity ?? 0;
      const newQuantity = existingQty + addQty;

      let newAvgPrice: number | null = existing.avg_price ?? null;
      if (holding.avg_price != null && holding.avg_price > 0 && addQty > 0) {
        if (existingQty > 0 && existing.avg_price != null) {
          newAvgPrice =
            (existingQty * existing.avg_price + addQty * holding.avg_price) / newQuantity;
        } else {
          newAvgPrice = holding.avg_price;
        }
      }

      const h = holding as { trading_currency?: string | null; purchase_currency?: string | null; purchase_fx_rate?: number | null; asset_type?: string | null; mic_code?: string | null; exchange?: string | null };
      const { data: updated, error } = await supabase
        .from('user_holdings')
        .update({
          quantity: newQuantity,
          avg_price: newAvgPrice,
          company_name: holding.company_name,
          updated_at: new Date().toISOString(),
          // Backfill-only: never overwrite a value the holding already has —
          // only fills in a currently-NULL field (e.g. a holding created
          // before trading_currency was captured, or a first import top-up).
          ...(existing.trading_currency == null && h.trading_currency ? { trading_currency: h.trading_currency } : {}),
          ...(existing.purchase_currency == null && h.purchase_currency ? { purchase_currency: h.purchase_currency } : {}),
          ...(existing.purchase_fx_rate == null && h.purchase_fx_rate != null ? { purchase_fx_rate: h.purchase_fx_rate } : {}),
          ...(existing.asset_type == null && h.asset_type ? { asset_type: h.asset_type } : {}),
          ...(existing.mic_code == null && h.mic_code ? { mic_code: h.mic_code } : {}),
          ...(existing.exchange == null && h.exchange ? { exchange: h.exchange } : {}),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      let purchaseLotId: string | undefined;
      if (addQty > 0 && holding.avg_price != null && holding.avg_price > 0) {
        const { count: existingLotCount, error: lotCountErr } = await supabase
          .from('holding_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('holding_id', existing.id);

        // Lazy backfill: an old holding with no recorded lots yet gets one
        // synthesized from its pre-update state, so the lot total doesn't
        // fall short of the holding's real share count. Skipped if we
        // can't confirm no lots exist yet, or if the pre-existing chunk
        // has no date to backfill at — see "Lazy backfill" in
        // docs/superpowers/specs/2026-08-21-holding-purchase-lots-design.md.
        if (!lotCountErr && !existingLotCount && existingQty > 0 && existing.avg_price != null && existing.date_purchased) {
          const backfillLot = recordHoldingPurchase(
            supabase,
            userId,
            {
              id: existing.id,
              symbol: updated.symbol,
              company_name: updated.company_name,
              purchase_currency: existing.purchase_currency,
              purchase_fx_rate: existing.purchase_fx_rate,
              trading_currency: existing.trading_currency,
              asset_type: existing.asset_type,
            },
            { quantity: existingQty, price: existing.avg_price, purchaseDate: existing.date_purchased }
          );
          if (awaitLots) await backfillLot; else void backfillLot;
        }

        const newLot = recordHoldingPurchase(
          supabase,
          userId,
          {
            id: existing.id,
            symbol: updated.symbol,
            company_name: updated.company_name,
            purchase_currency: holding.purchase_currency,
            purchase_fx_rate: holding.purchase_fx_rate,
            trading_currency: holding.trading_currency,
            asset_type: holding.asset_type,
          },
          { quantity: addQty, price: holding.avg_price, purchaseDate: holding.date_purchased ?? new Date().toISOString().slice(0, 10) }
        );
        if (awaitLots) {
          const inserted = await newLot;
          purchaseLotId = inserted?.id;
        } else {
          void newLot;
        }
      }

      if (recordActivity) {
        if (existingQty <= 0) {
          void recordPortfolioActivity(userId, updated.symbol, updated.company_name, 'opened');
        } else {
          void recordPortfolioActivity(userId, updated.symbol, updated.company_name, 'increased', (addQty / existingQty) * 100);
        }
      }

      return { success: true, holding: updated as UserHolding, purchaseLotId };
    }

    return addHolding(userId, holding, opts);
  } catch (error) {
    logger.error('Error in addOrUpdateHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Update an existing holding
 */
export async function updateHolding(
  userId: string,
  holdingId: string,
  updates: Omit<UpdateUserHolding, 'id'>
): Promise<UpdateHoldingResult> {
  try {
    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: checkError } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('id', holdingId)
      .eq('user_id', userId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: 'Holding not found or access denied',
      };
    }

    // Build update object (only include defined fields)
    const updateData: Partial<InsertUserHolding> = {};
    if (updates.symbol !== undefined) updateData.symbol = updates.symbol.toUpperCase();
    if (updates.company_name !== undefined) updateData.company_name = updates.company_name;
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
    if (updates.avg_price !== undefined) updateData.avg_price = updates.avg_price;
    if ('date_purchased' in updates) updateData.date_purchased = (updates as { date_purchased?: string | null }).date_purchased ?? null;
    if ('purchase_currency' in updates) updateData.purchase_currency = (updates as { purchase_currency?: string | null }).purchase_currency ?? null;
    if ('purchase_fx_rate' in updates) updateData.purchase_fx_rate = (updates as { purchase_fx_rate?: number | null }).purchase_fx_rate ?? null;

    // Update holding
    const { data: updated, error: updateError } = await supabase
      .from('user_holdings')
      .update(updateData)
      .eq('id', holdingId)
      .eq('user_id', userId) // Double-check ownership
      .select()
      .single();

    if (updateError) {
      logger.error('Error updating holding:', updateError);
      return {
        success: false,
        error: updateError.message || 'Failed to update holding',
      };
    }

    return {
      success: true,
      holding: updated as UserHolding,
    };
  } catch (error) {
    logger.error('Error in updateHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Update a holding identified by ticker symbol.
 * Always scoped to the given userId — ownership is enforced at query level.
 */
export async function updateHoldingBySymbol(
  userId: string,
  symbol: string,
  updates: { quantity?: number | null; avg_price?: number | null }
): Promise<UpdateHoldingResult> {
  try {
    const supabase = createServerClient();
    const upperSymbol = symbol.toUpperCase();

    const { data: existing, error: lookupErr } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', upperSymbol)
      .maybeSingle();

    if (lookupErr || !existing) {
      return { success: false, error: `No holding found for ${upperSymbol}` };
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
    if (updates.avg_price !== undefined) updateData.avg_price = updates.avg_price;

    const { data: updated, error: updateErr } = await supabase
      .from('user_holdings')
      .update(updateData)
      .eq('id', existing.id)
      .eq('user_id', userId) // second ownership check
      .select()
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
    return { success: true, holding: updated as UserHolding };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Internal server error' };
  }
}

/**
 * Remove a holding identified by ticker symbol.
 * Always scoped to the given userId — ownership is enforced at query level.
 */
export async function removeHoldingBySymbol(
  userId: string,
  symbol: string
): Promise<RemoveHoldingResult> {
  try {
    const supabase = createServerClient();
    const upperSymbol = symbol.toUpperCase();

    // Verify the holding belongs to this user before deleting
    const { data: existing, error: lookupErr } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', upperSymbol)
      .maybeSingle();

    if (lookupErr || !existing) {
      return { success: false, error: `No holding found for ${upperSymbol}` };
    }

    const { error: deleteErr } = await supabase
      .from('user_holdings')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', userId); // enforces ownership

    if (deleteErr) {
      return { success: false, error: deleteErr.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Internal server error' };
  }
}

/**
 * Remove a holding
 */
export async function removeHolding(
  userId: string,
  holdingId: string
): Promise<RemoveHoldingResult> {
  try {
    const supabase = createServerClient();

    // Verify ownership and delete
    const { error: deleteError } = await supabase
      .from('user_holdings')
      .delete()
      .eq('id', holdingId)
      .eq('user_id', userId); // RLS will ensure user can only delete their own

    if (deleteError) {
      logger.error('Error removing holding:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Failed to remove holding',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error in removeHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

export interface SellHoldingResult {
  success: boolean;
  sale?: HoldingSale;
  holding?: UserHolding;
  error?: string;
}

export interface GetHoldingSalesResult {
  success: boolean;
  sales?: HoldingSale[];
  error?: string;
}

const SELL_EPSILON = 1e-9;

/**
 * Records a sale against a manually-entered holding: inserts a `holding_sales`
 * row snapshotting the current avg_price as this sale's cost basis, then
 * decrements the holding's quantity. avg_price on user_holdings is left
 * untouched — under average-cost accounting, selling shares never changes
 * the cost basis of the shares you keep. A full sell brings quantity to 0
 * but the row is not deleted, so it stays available for chart reconstruction
 * and the closed-positions list.
 */
export async function sellHolding(
  userId: string,
  holdingId: string,
  input: { quantitySold: number; salePrice: number; saleDate: string },
  opts: HoldingMutationOpts = {}
): Promise<SellHoldingResult> {
  const { recordActivity = true } = opts;
  try {
    if (!(input.quantitySold > 0)) {
      return { success: false, error: 'Quantity sold must be greater than zero' };
    }
    if (!(input.salePrice > 0)) {
      return { success: false, error: 'Sale price must be greater than zero' };
    }

    const supabase = createServerClient();

    const { data: holding, error: lookupErr } = await supabase
      .from('user_holdings')
      .select('id, symbol, company_name, quantity, avg_price, source, trading_currency, asset_type')
      .eq('id', holdingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr || !holding) {
      return { success: false, error: 'Holding not found or access denied' };
    }
    if (holding.source !== 'manual') {
      return { success: false, error: 'Selling is only available for manually-entered holdings' };
    }
    if (holding.avg_price == null) {
      return { success: false, error: 'This holding has no average cost — edit it to add one before selling' };
    }
    const currentQty = holding.quantity ?? 0;
    if (input.quantitySold > currentQty + SELL_EPSILON) {
      return { success: false, error: `Cannot sell more than the ${currentQty} shares you hold` };
    }

    const realizedPl = (input.salePrice - holding.avg_price) * input.quantitySold;

    const saleInsert: Omit<InsertHoldingSale, 'id'> = {
      user_id: userId,
      original_holding_id: holding.id,
      symbol: holding.symbol,
      company_name: holding.company_name,
      quantity_sold: input.quantitySold,
      avg_cost_basis: holding.avg_price,
      sale_price: input.salePrice,
      realized_pl: realizedPl,
      sale_date: input.saleDate,
      trading_currency: holding.trading_currency ?? null,
      asset_type: holding.asset_type ?? null,
    };

    const { data: sale, error: insertErr } = await supabase
      .from('holding_sales')
      .insert(saleInsert)
      .select()
      .single();

    if (insertErr || !sale) {
      return { success: false, error: insertErr?.message || 'Failed to record sale' };
    }

    const newQuantity = Math.max(0, currentQty - input.quantitySold);
    const { data: updatedHolding, error: updateErr } = await supabase
      .from('user_holdings')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', holding.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      // Sale is already recorded; surface the error but don't lose the sale record.
      return { success: false, sale: sale as HoldingSale, error: `Sale recorded, but updating quantity failed: ${updateErr.message}` };
    }

    if (recordActivity) {
      if (newQuantity <= SELL_EPSILON) {
        void recordPortfolioActivity(userId, holding.symbol, holding.company_name, 'closed');
      } else {
        void recordPortfolioActivity(userId, holding.symbol, holding.company_name, 'trimmed', (input.quantitySold / currentQty) * 100);
      }
    }

    return { success: true, sale: sale as HoldingSale, holding: updatedHolding as UserHolding };
  } catch (error) {
    logger.error('Error in sellHolding:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/**
 * Lists this user's recorded sales, newest first.
 */
export async function getHoldingSales(userId: string): Promise<GetHoldingSalesResult> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('holding_sales')
      .select('*')
      .eq('user_id', userId)
      .order('sale_date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, sales: (data ?? []) as HoldingSale[] };
  } catch (error) {
    logger.error('Error in getHoldingSales:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/**
 * Deletes a manually-entered sale record and adds the sold quantity back
 * onto the originating holding — for undoing a data-entry mistake (wrong
 * price, wrong date). Blocked if the originating holding was itself later
 * hard-deleted (original_holding_id is null): there's nothing to add the
 * shares back onto, so the user needs to re-add the holding manually first.
 */
export async function deleteHoldingSale(
  userId: string,
  saleId: string
): Promise<RemoveHoldingResult> {
  try {
    const supabase = createServerClient();

    const { data: sale, error: lookupErr } = await supabase
      .from('holding_sales')
      .select('id, original_holding_id, quantity_sold')
      .eq('id', saleId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr || !sale) {
      return { success: false, error: 'Sale not found or access denied' };
    }
    if (!sale.original_holding_id) {
      return { success: false, error: 'The original holding no longer exists — re-add it before undoing this sale' };
    }

    const { data: holding, error: holdingErr } = await supabase
      .from('user_holdings')
      .select('id, quantity')
      .eq('id', sale.original_holding_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (holdingErr || !holding) {
      return { success: false, error: 'The original holding no longer exists — re-add it before undoing this sale' };
    }

    const { error: updateErr } = await supabase
      .from('user_holdings')
      .update({ quantity: (holding.quantity ?? 0) + sale.quantity_sold, updated_at: new Date().toISOString() })
      .eq('id', holding.id)
      .eq('user_id', userId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const { error: deleteErr } = await supabase
      .from('holding_sales')
      .delete()
      .eq('id', saleId)
      .eq('user_id', userId);

    if (deleteErr) {
      return { success: false, error: deleteErr.message };
    }
    return { success: true };
  } catch (error) {
    logger.error('Error in deleteHoldingSale:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/**
 * Edits a recorded sale in place — for correcting a data-entry mistake
 * (wrong price, date, or quantity) without the undo-then-redo round trip.
 * avg_cost_basis is never touched (it's the cost basis of the shares AT SALE
 * TIME, not something this form edits); realized_pl is recomputed from it.
 *
 * Only touches user_holdings.quantity when quantity_sold actually changes,
 * shifting it by the delta so the originating holding stays consistent
 * (more sold now → less held; less sold now → more held). Blocked when the
 * quantity changes but the originating holding was later hard-deleted —
 * same restriction as deleteHoldingSale, since there's nothing to shift the
 * delta onto.
 */
export async function updateHoldingSale(
  userId: string,
  saleId: string,
  input: { quantitySold: number; salePrice: number; saleDate: string }
): Promise<SellHoldingResult> {
  try {
    if (!(input.quantitySold > 0)) {
      return { success: false, error: 'Quantity sold must be greater than zero' };
    }
    if (!(input.salePrice > 0)) {
      return { success: false, error: 'Sale price must be greater than zero' };
    }

    const supabase = createServerClient();

    const { data: sale, error: lookupErr } = await supabase
      .from('holding_sales')
      .select('id, original_holding_id, quantity_sold, avg_cost_basis')
      .eq('id', saleId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr || !sale) {
      return { success: false, error: 'Sale not found or access denied' };
    }

    const qtyDelta = input.quantitySold - sale.quantity_sold;
    let updatedHolding: UserHolding | undefined;

    if (Math.abs(qtyDelta) > SELL_EPSILON) {
      if (!sale.original_holding_id) {
        return { success: false, error: 'The original holding no longer exists — changing the quantity sold requires re-adding the holding first' };
      }

      const { data: holding, error: holdingErr } = await supabase
        .from('user_holdings')
        .select('id, quantity')
        .eq('id', sale.original_holding_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (holdingErr || !holding) {
        return { success: false, error: 'The original holding no longer exists — changing the quantity sold requires re-adding the holding first' };
      }

      const newHoldingQty = (holding.quantity ?? 0) - qtyDelta;
      if (newHoldingQty < -SELL_EPSILON) {
        const available = (holding.quantity ?? 0) + sale.quantity_sold;
        return { success: false, error: `Cannot sell more than the ${available} shares available` };
      }

      const { data: holdingUpdate, error: updateErr } = await supabase
        .from('user_holdings')
        .update({ quantity: Math.max(0, newHoldingQty), updated_at: new Date().toISOString() })
        .eq('id', holding.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
      updatedHolding = holdingUpdate as UserHolding;
    }

    const realizedPl = (input.salePrice - sale.avg_cost_basis) * input.quantitySold;
    const { data: updatedSale, error: saleUpdateErr } = await supabase
      .from('holding_sales')
      .update({
        quantity_sold: input.quantitySold,
        sale_price: input.salePrice,
        sale_date: input.saleDate,
        realized_pl: realizedPl,
      })
      .eq('id', saleId)
      .eq('user_id', userId)
      .select()
      .single();

    if (saleUpdateErr || !updatedSale) {
      return { success: false, error: saleUpdateErr?.message || 'Failed to update sale' };
    }

    return { success: true, sale: updatedSale as HoldingSale, holding: updatedHolding };
  } catch (error) {
    logger.error('Error in updateHoldingSale:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

export interface GetHoldingPurchasesResult {
  success: boolean;
  purchases?: HoldingPurchase[];
  error?: string;
}

/**
 * Lists this user's recorded purchase lots, oldest first (chart markers want
 * chronological order; buildTransactionMarkers re-sorts anyway, but this
 * keeps the raw list itself readable if it's ever displayed directly).
 */
export async function getHoldingPurchases(userId: string): Promise<GetHoldingPurchasesResult> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('holding_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('purchase_date', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, purchases: (data ?? []) as HoldingPurchase[] };
  } catch (error) {
    logger.error('Error in getHoldingPurchases:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}