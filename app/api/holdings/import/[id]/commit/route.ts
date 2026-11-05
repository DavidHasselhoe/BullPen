/**
 * POST /api/holdings/import/[id]/commit
 *
 * Replays a reviewed draft into real holdings. Re-validates everything
 * server-side rather than trusting the client's "ready" count — a stale
 * tab, a race with another session, or a tampered request could otherwise
 * commit a broken plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { planReplay, type ExistingHolding } from '@/lib/import/plan-replay';
import { executeReplay, type ResolvedSecurityInfo } from '@/lib/import/execute-replay';
import { inferAssetType } from '@/lib/assets/asset-type';
import type { RawTransaction } from '@/lib/import/types';
import type { SecurityResolution } from '@/lib/import/resolve-security';

export const maxDuration = 300;

interface DraftShape {
  transactions: RawTransaction[];
  resolutions: Record<string, SecurityResolution>;
  removedSourceLines: number[];
}

async function handler(request: NextRequest, context: unknown, session: { userId: string }): Promise<NextResponse> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = createServerClient();

  // 'replace' clears the user's current manual position in every ticker
  // this import touches before replaying, instead of stacking imported
  // buys/sells on top of what's already there. Defaults to 'add' (the
  // original behavior) for any caller that doesn't send a mode.
  // 'replace_all' clears the whole manual portfolio first (see below).
  let mode: 'add' | 'replace' | 'replace_all' = 'add';
  try {
    const body = await request.json();
    if (body?.mode === 'replace' || body?.mode === 'replace_all') mode = body.mode;
  } catch {
    // no body / not JSON — keep the 'add' default
  }

  const { data: row, error } = await supabase
    .from('holdings_imports')
    .select('id, status, parsed')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error || !row) {
    return addSecurityHeaders(NextResponse.json({ error: 'Import not found' }, { status: 404 }));
  }
  if (row.status !== 'draft') {
    return addSecurityHeaders(NextResponse.json({ error: `This import is already "${row.status}".` }, { status: 409 }));
  }

  const draft = row.parsed as DraftShape;
  const removed = new Set(draft.removedSourceLines ?? []);
  const activeTransactions = draft.transactions.filter((t) => !removed.has(t.sourceLine));

  // Every remaining transaction's security must be resolved — the review
  // grid should already enforce this client-side, but the server is the
  // real gate.
  const unresolvedLines = activeTransactions
    .filter((t) => draft.resolutions[t.securityKey]?.status !== 'resolved')
    .map((t) => t.sourceLine);
  if (unresolvedLines.length > 0) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Some transactions still need a ticker match before saving.', sourceLines: unresolvedLines }, { status: 422 })
    );
  }
  if (activeTransactions.length === 0) {
    return addSecurityHeaders(NextResponse.json({ error: 'No transactions to save.' }, { status: 422 }));
  }

  const bySecurityKey = new Map<string, { symbol: string; name: string | null }>();
  const resolvedInfo = new Map<string, ResolvedSecurityInfo>();
  for (const [key, resolution] of Object.entries(draft.resolutions)) {
    if (resolution.status !== 'resolved') continue;
    const { candidate } = resolution;
    const first = activeTransactions.find((t) => t.securityKey === key);
    const companyName = candidate.instrument_name || first?.name || candidate.symbol;
    bySecurityKey.set(key, { symbol: candidate.symbol, name: companyName });
    // inferAssetType's return type includes 'unknown' for completeness but
    // never actually returns it (the function's own fallback is 'stock') —
    // still, coerce defensively since ResolvedSecurityInfo's DB-backed type
    // doesn't have an 'unknown' asset_type value to store.
    const inferredType = inferAssetType(candidate.symbol, candidate.instrument_type);
    resolvedInfo.set(key, {
      symbol: candidate.symbol,
      companyName,
      tradingCurrency: candidate.currency || null,
      assetType: inferredType === 'unknown' ? 'stock' : inferredType,
      // The exact listing resolve-security.ts already quote-verified — pin
      // it so a later re-fetch doesn't have to re-guess from a bare symbol.
      micCode: candidate.mic_code || null,
      exchange: candidate.exchange || null,
    });
  }

  const { data: existingRows } = await supabase
    .from('user_holdings')
    .select('id, symbol, quantity, source')
    .eq('user_id', session.userId);
  const existingHoldings = new Map<string, ExistingHolding>(
    (existingRows ?? []).map((r) => [
      r.symbol,
      { id: r.id as string, symbol: r.symbol as string, quantity: (r.quantity as number) ?? 0, source: r.source as 'manual' | 'snaptrade' },
    ])
  );

  if (mode === 'replace') {
    // Only ever clears a MANUAL holding in a symbol this import actually
    // touches — a SnapTrade-synced position is never deleted by an import,
    // same guard plan-replay already applies to selling against one.
    // "Rebuilt from this file alone" means the history goes too: deleting
    // the holding cascades to holding_purchases (its lots), but
    // holding_sales only detaches, so the old sales would sit next to the
    // file's own sells and double the realized P/L. Sales are cleared by
    // symbol so orphans from an earlier replace or a deleted holding go
    // as well, and the old activity events go so the feed doesn't show
    // the position opening twice.
    const importedSymbols = new Set([...bySecurityKey.values()].map((v) => v.symbol));
    const toReplace = [...existingHoldings.values()].filter((h) => h.source === 'manual' && importedSymbols.has(h.symbol));
    if (toReplace.length > 0) {
      const replacedSymbols = toReplace.map((h) => h.symbol);
      // Holdings first: if that fails nothing is lost. If a later delete
      // fails, the leftover sales are detached and the user can remove
      // them from History, which beats losing history for an import that
      // never ran.
      const { error: deleteError } = await supabase
        .from('user_holdings')
        .delete()
        .eq('user_id', session.userId)
        .in('id', toReplace.map((h) => h.id));
      if (deleteError) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Failed to clear your existing holdings before replacing them.' }, { status: 500 })
        );
      }
      const { error: salesError } = await supabase
        .from('holding_sales')
        .delete()
        .eq('user_id', session.userId)
        .in('symbol', replacedSymbols);
      if (salesError) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Failed to clear your existing sales history before replacing it.' }, { status: 500 })
        );
      }
      const { error: activityError } = await supabase
        .from('portfolio_activity')
        .delete()
        .eq('user_id', session.userId)
        .in('symbol', replacedSymbols);
      if (activityError) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Failed to clear your existing activity before replacing it.' }, { status: 500 })
        );
      }
      for (const h of toReplace) existingHoldings.delete(h.symbol);
    }
  }

  // 'replace_all' plans against the synced holdings alone, since every
  // manual one is about to go. Planning first means a blocked file never
  // clears anything.
  if (mode === 'replace_all') {
    for (const h of [...existingHoldings.values()]) if (h.source === 'manual') existingHoldings.delete(h.symbol);
  }

  const plan = planReplay(activeTransactions, bySecurityKey, existingHoldings);
  if (plan.blocked) {
    return addSecurityHeaders(NextResponse.json({ error: 'Some transactions need attention before saving.', flags: plan.flags }, { status: 422 }));
  }

  const { data: userRow } = await supabase.from('users').select('settings').eq('id', session.userId).single();
  const settings = (userRow?.settings as Record<string, unknown>) ?? {};
  const homeCurrency = typeof settings.default_currency === 'string' && settings.default_currency !== 'exchange' ? settings.default_currency : 'USD';

  if (mode === 'replace_all') {
    // One transaction: snapshot every manual holding, lot, sale and activity
    // row onto the import, then delete them (migration 189).
    const { error: clearError } = await supabase.rpc('import_clear_manual_portfolio', {
      p_user_id: session.userId,
      p_import_id: id,
    });
    if (clearError) {
      const notDraft = clearError.message.includes('import_not_draft');
      return addSecurityHeaders(
        NextResponse.json(
          { error: notDraft ? 'This import is already being saved.' : 'Could not clear your portfolio, so nothing was changed.' },
          { status: notDraft ? 409 : 500 }
        )
      );
    }
  }

  // A throw (an FX lookup, a dropped connection) must reach the rollback
  // below too, not skip it with the portfolio already cleared.
  const result = await executeReplay(session.userId, id, plan, resolvedInfo, homeCurrency).catch(
    (err: unknown) => ({ success: false, appliedCount: 0, totalCount: plan.ops.length, error: err instanceof Error ? err.message : 'Import failed' })
  );

  if (!result.success && mode === 'replace_all') {
    // Put the old portfolio back and hand the draft back to the review grid,
    // so a failed import never leaves an empty portfolio behind.
    const { error: restoreError } = await supabase.rpc('import_restore_manual_portfolio', {
      p_user_id: session.userId,
      p_import_id: id,
      p_reset_to_draft: true,
    });
    return addSecurityHeaders(
      NextResponse.json(
        {
          error: restoreError
            ? 'The import failed partway. Your previous portfolio is saved. Use Undo on the Holdings page to restore it.'
            : 'The import failed, so your portfolio was left as it was. You can try saving again.',
        },
        { status: 500 }
      )
    );
  }

  if (!result.success) {
    return addSecurityHeaders(
      NextResponse.json({ error: result.error ?? 'Import failed partway through.', appliedCount: result.appliedCount, totalCount: result.totalCount }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, appliedCount: result.appliedCount, totalCount: result.totalCount }));
}

export const POST = withAuth(handler);
