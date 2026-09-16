/**
 * Reverses a committed import by walking `holdings_import_events` backwards.
 *
 * executeReplay journals every write it makes (one row per buy lot / sell
 * record, with a monotonic `seq`), specifically so this path could exist.
 * Reversing in exact reverse `seq` order is what makes the arithmetic sound:
 * user_holdings.quantity/avg_price are denormalized running values, not
 * derived from the lots, so the only exact inverse of "buy N at P appended
 * to a weighted average" is to unwind the most recent write first.
 *
 * Not wrapped in a DB transaction, for the same reason executeReplay isn't.
 * Instead each journal row is DELETED as its write is successfully reversed,
 * so the journal always describes what this import still has applied: a
 * failure partway leaves the import 'done' with the remaining rows intact,
 * and running undo again resumes exactly where it stopped.
 */

import { createServerClient } from '@/lib/supabase/client';
import { deleteHoldingSale } from '@/lib/holdings/holdings-db';
import { logger } from '@/lib/utils/logger';

/** Matches SELL_EPSILON in holdings-db — a quantity this small is zero. */
const QTY_EPSILON = 1e-9;

export interface UndoImportResult {
  success: boolean;
  revertedCount?: number;
  /** Set when the import can't be undone at all, so nothing was touched. */
  blocked?: boolean;
  error?: string;
}

/**
 * Inverse of the weighted-average update in addOrUpdateHolding:
 *   newAvg = (heldQty * heldAvg + lotQty * lotPrice) / (heldQty + lotQty)
 * Solving for the previous average and removing `lotQty` shares.
 *
 * Returns the average to store after the lot is removed. When the position
 * empties out, the average stops being meaningful, so the current one is
 * kept rather than dividing by zero. A result that comes out non-positive
 * means the stored numbers never matched this lot (a hand-edited avg_price,
 * a pre-lots holding); keeping the current average is the safe answer there
 * too, since inventing a negative cost basis is worse than a stale one.
 */
export function reverseWeightedAverage(
  heldQty: number,
  heldAvg: number | null,
  lotQty: number,
  lotPrice: number
): number | null {
  const remaining = heldQty - lotQty;
  if (heldAvg == null || remaining <= QTY_EPSILON) return heldAvg;
  const prevAvg = (heldQty * heldAvg - lotQty * lotPrice) / remaining;
  return prevAvg > 0 ? prevAvg : heldAvg;
}

interface JournalEvent {
  id: number;
  seq: number;
  action: string;
  symbol: string;
  entity_table: string | null;
  entity_id: string | null;
  holding_id: string | null;
  created_at: string;
}

export async function undoImport(userId: string, importId: string): Promise<UndoImportResult> {
  try {
    const supabase = createServerClient();

    const { data: importRow, error: importErr } = await supabase
      .from('holdings_imports')
      .select('id, status, created_at, committed_at')
      .eq('id', importId)
      .eq('user_id', userId)
      .maybeSingle();

    if (importErr || !importRow) {
      return { success: false, blocked: true, error: 'Import not found' };
    }
    // 'failed' is undoable on purpose: a run that died partway applied
    // everything up to the failure, and that half-import is exactly the
    // mess worth reversing.
    if (importRow.status !== 'done' && importRow.status !== 'failed') {
      return { success: false, blocked: true, error: `This import can't be undone (it is "${importRow.status}").` };
    }

    const { data: eventRows, error: eventsErr } = await supabase
      .from('holdings_import_events')
      .select('id, seq, action, symbol, entity_table, entity_id, holding_id, created_at')
      .eq('import_id', importId)
      .order('seq', { ascending: false });

    if (eventsErr) {
      return { success: false, blocked: true, error: 'Could not read what this import changed.' };
    }
    const events = (eventRows ?? []) as JournalEvent[];
    if (events.length === 0) {
      await supabase.from('holdings_imports').update({ status: 'undone' }).eq('id', importId).eq('user_id', userId);
      return { success: true, revertedCount: 0 };
    }

    const ourLotIds = events.filter((e) => e.entity_table === 'holding_purchases' && e.entity_id).map((e) => e.entity_id as string);
    const ourSaleIds = events.filter((e) => e.entity_table === 'holding_sales' && e.entity_id).map((e) => e.entity_id as string);
    const touchedHoldingIds = [...new Set(events.map((e) => e.holding_id).filter((id): id is string => !!id))];

    // Every "is this newer than the import?" comparison uses the journal's
    // own timestamps, never holdings_imports.committed_at. committed_at is
    // written by the app (new Date()), while created_at on lots and sales
    // comes from Postgres, and those two clocks drift — measured ~3s apart
    // against this project, which was enough to make a purchase added after
    // the import look older than it and slip past this guard entirely.
    const timestamps = events.map((e) => e.created_at).sort();
    const firstWriteAt = timestamps[0];
    const lastWriteAt = timestamps[timestamps.length - 1];

    const blocked = await findChangesSinceImport(userId, touchedHoldingIds, ourLotIds, ourSaleIds, lastWriteAt);
    if (blocked) return { success: false, blocked: true, error: blocked };

    let reverted = 0;
    for (const event of events) {
      const failure = await reverseEvent(userId, event);
      if (failure) {
        await supabase
          .from('holdings_imports')
          .update({ error_message: `Undo stopped after ${reverted} of ${events.length}: ${failure}` })
          .eq('id', importId)
          .eq('user_id', userId);
        return { success: false, revertedCount: reverted, error: failure };
      }
      // Drop the journal row only once its write is actually gone, so a
      // retry after a mid-way failure picks up from here.
      await supabase.from('holdings_import_events').delete().eq('id', event.id);
      reverted++;
    }

    await removeEmptiedHoldings(userId, touchedHoldingIds, importRow.created_at as string | null, firstWriteAt);

    await supabase
      .from('holdings_imports')
      .update({ status: 'undone', applied_count: 0, error_message: null })
      .eq('id', importId)
      .eq('user_id', userId);

    return { success: true, revertedCount: reverted };
  } catch (error) {
    logger.error('Error in undoImport:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/**
 * Refuses the undo if the positions it would rewind have moved on since.
 * Reversing a running average is only exact if this import's writes are
 * still the most recent ones on those holdings — a buy or sell added
 * afterwards would silently get its cost basis rewritten.
 */
async function findChangesSinceImport(
  userId: string,
  holdingIds: string[],
  ourLotIds: string[],
  ourSaleIds: string[],
  lastWriteAt: string | undefined
): Promise<string | null> {
  const supabase = createServerClient();
  const CANNOT_VERIFY = 'Could not check whether these positions changed since the import, so nothing was undone. Try again in a moment.';

  // Everything this import wrote must still be there. A lot or sale the
  // user deleted by hand means the holding has already been rewritten.
  if (ourLotIds.length > 0) {
    const { count, error } = await supabase
      .from('holding_purchases')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('id', ourLotIds);
    if (error) return CANNOT_VERIFY;
    if ((count ?? 0) !== ourLotIds.length) {
      return 'Some of these transactions have already been changed or removed, so this import can no longer be undone automatically.';
    }
  }
  if (ourSaleIds.length > 0) {
    const { count, error } = await supabase
      .from('holding_sales')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('id', ourSaleIds);
    if (error) return CANNOT_VERIFY;
    if ((count ?? 0) !== ourSaleIds.length) {
      return 'Some of these transactions have already been changed or removed, so this import can no longer be undone automatically.';
    }
  }

  if (holdingIds.length === 0 || !lastWriteAt) return null;

  // Anything written to these holdings after this import's own last write,
  // that this import didn't write itself, is a later change sitting on top
  // of ours. The "not ours" filter happens here rather than in the query so
  // a malformed id list can't turn into an empty result set that reads as
  // "all clear" — a guard that fails open is worse than no guard.
  const { data: laterLots, error: lotsErr } = await supabase
    .from('holding_purchases')
    .select('id, symbol')
    .eq('user_id', userId)
    .in('holding_id', holdingIds)
    .gt('created_at', lastWriteAt);
  if (lotsErr) return CANNOT_VERIFY;
  const foreignLot = (laterLots ?? []).find((l) => !ourLotIds.includes(l.id as string));
  if (foreignLot) {
    return `You've added transactions to ${foreignLot.symbol} since this import, so undoing it would rewrite those too.`;
  }

  const { data: laterSales, error: salesErr } = await supabase
    .from('holding_sales')
    .select('id, symbol')
    .eq('user_id', userId)
    .in('original_holding_id', holdingIds)
    .gt('created_at', lastWriteAt);
  if (salesErr) return CANNOT_VERIFY;
  const foreignSale = (laterSales ?? []).find((s) => !ourSaleIds.includes(s.id as string));
  if (foreignSale) {
    return `You've sold ${foreignSale.symbol} since this import, so undoing it would rewrite that sale too.`;
  }

  return null;
}

/** Applies the exact inverse of one journalled write. Returns an error string on failure. */
async function reverseEvent(userId: string, event: JournalEvent): Promise<string | null> {
  const supabase = createServerClient();

  if (event.action === 'sell') {
    if (!event.entity_id) return null;
    // Reuse the same path the "undo this sale" button uses — it already
    // adds the shares back to the holding and deletes the sale row.
    const result = await deleteHoldingSale(userId, event.entity_id);
    return result.success ? null : (result.error ?? `Could not undo the sale of ${event.symbol}`);
  }

  if (!event.entity_id || !event.holding_id) return null;

  const { data: lot } = await supabase
    .from('holding_purchases')
    .select('id, quantity, price')
    .eq('id', event.entity_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!lot) return null; // already gone; nothing to reverse

  const { data: holding } = await supabase
    .from('user_holdings')
    .select('id, quantity, avg_price')
    .eq('id', event.holding_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!holding) return null; // holding already deleted; the lot went with it

  const heldQty = (holding.quantity as number) ?? 0;
  const lotQty = lot.quantity as number;
  const newQuantity = Math.max(0, heldQty - lotQty);
  const newAvg = reverseWeightedAverage(heldQty, (holding.avg_price as number) ?? null, lotQty, lot.price as number);

  const { error: updateErr } = await supabase
    .from('user_holdings')
    .update({ quantity: newQuantity, avg_price: newAvg, updated_at: new Date().toISOString() })
    .eq('id', holding.id)
    .eq('user_id', userId);
  if (updateErr) return `Could not update ${event.symbol}: ${updateErr.message}`;

  const { error: deleteErr } = await supabase
    .from('holding_purchases')
    .delete()
    .eq('id', lot.id)
    .eq('user_id', userId);
  if (deleteErr) return `Could not remove the imported purchase of ${event.symbol}: ${deleteErr.message}`;

  return null;
}

/**
 * Drops holdings the import created outright, so undo doesn't leave behind a
 * row for a position the user never had.
 *
 * Deliberately strict, because an existing holding that sits at zero shares
 * is meaningful here: sellHolding zeroes quantity instead of deleting the row
 * precisely so sales history and chart reconstruction keep working. A row is
 * only removed when all three hold: it ends at zero shares, it has no
 * purchase lots left, and it was created after this import's draft existed.
 * The last one is what separates "the import opened this" from "the user had
 * already closed this position and the import bought back into it".
 */
async function removeEmptiedHoldings(
  userId: string,
  holdingIds: string[],
  importCreatedAt: string | null,
  firstWriteAt: string | undefined
): Promise<void> {
  if (holdingIds.length === 0) return;
  const supabase = createServerClient();

  const { data: holdings } = await supabase
    .from('user_holdings')
    .select('id, symbol, quantity, created_at')
    .eq('user_id', userId)
    .in('id', holdingIds);

  for (const holding of holdings ?? []) {
    if (((holding.quantity as number) ?? 0) > QTY_EPSILON) continue;
    if (importCreatedAt && new Date(holding.created_at as string) < new Date(importCreatedAt)) continue;
    const { count } = await supabase
      .from('holding_purchases')
      .select('*', { count: 'exact', head: true })
      .eq('holding_id', holding.id);
    if ((count ?? 0) > 0) continue;

    await supabase.from('user_holdings').delete().eq('id', holding.id).eq('user_id', userId);

    // The import logged an 'opened' event for each position it created.
    // Leaving those behind advertises a position on the public profile
    // that no longer exists.
    if (firstWriteAt) {
      await supabase
        .from('portfolio_activity')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', holding.symbol)
        .eq('action', 'opened')
        .gte('created_at', firstWriteAt);
    }
  }
}
