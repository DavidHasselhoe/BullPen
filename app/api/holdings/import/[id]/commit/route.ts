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

  const plan = planReplay(activeTransactions, bySecurityKey, existingHoldings);
  if (plan.blocked) {
    return addSecurityHeaders(NextResponse.json({ error: 'Some transactions need attention before saving.', flags: plan.flags }, { status: 422 }));
  }

  const { data: userRow } = await supabase.from('users').select('settings').eq('id', session.userId).single();
  const settings = (userRow?.settings as Record<string, unknown>) ?? {};
  const homeCurrency = typeof settings.default_currency === 'string' && settings.default_currency !== 'exchange' ? settings.default_currency : 'USD';

  const result = await executeReplay(session.userId, id, plan, resolvedInfo, homeCurrency);

  if (!result.success) {
    return addSecurityHeaders(
      NextResponse.json({ error: result.error ?? 'Import failed partway through.', appliedCount: result.appliedCount, totalCount: result.totalCount }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, appliedCount: result.appliedCount, totalCount: result.totalCount }));
}

export const POST = withAuth(handler);
