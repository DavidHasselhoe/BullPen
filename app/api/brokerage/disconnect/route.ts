// DELETE /api/brokerage/disconnect
// Removes the SnapTrade user (all connections) and marks all brokerage_connections
// as inactive. Synced holdings are preserved — users can manually remove them.
//
// Optional body: { accountId: string } to disconnect a single account via SnapTrade
// authorization deletion rather than removing the whole user.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getSnapTradeClient, isSnapTradeConfigured } from '@/lib/snaptrade/client';

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: snapUser } = await supabase
    .from('snaptrade_users')
    .select('snaptrade_user_id, user_secret')
    .eq('user_id', userId)
    .maybeSingle();

  if (!snapUser) {
    return NextResponse.json({ error: 'No brokerage connection found.' }, { status: 404 });
  }

  // Parse optional body — if no authorizationId, delete the entire SnapTrade user
  let authorizationId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    authorizationId = (body as { authorizationId?: string }).authorizationId ?? null;
  } catch {
    // No body — full disconnect
  }

  // Whether or not the SnapTrade-side call below succeeds, the user's intent
  // ("stop showing this as connected in BullPen") must still be honored — a
  // userId/userSecret registered under a since-rotated SnapTrade client
  // credential (e.g. a connection made before the 2026-08-29 production-key
  // cutover) will reject every call from the current client with an auth
  // error, and there is no way to migrate it after the fact. Treating that
  // as a hard failure would permanently strand the connection in the UI with
  // no user-facing recourse, so SnapTrade errors here are logged and
  // swallowed rather than propagated — local cleanup always proceeds.
  let snaptradeError: string | null = null;

  if (isSnapTradeConfigured()) {
    const snaptrade = getSnapTradeClient();

    try {
      if (authorizationId) {
        await snaptrade.connections.removeBrokerageAuthorization({
          authorizationId,
          userId: snapUser.snaptrade_user_id,
          userSecret: snapUser.user_secret,
        });
      } else {
        await snaptrade.authentication.deleteSnapTradeUser({
          userId: snapUser.snaptrade_user_id,
        });
      }
    } catch (err) {
      snaptradeError = err instanceof Error ? err.message : 'Unknown SnapTrade error';
      console.error('[brokerage/disconnect] SnapTrade-side cleanup failed, proceeding with local-only disconnect:', snaptradeError);
    }
  }

  try {
    if (authorizationId) {
      await supabase
        .from('brokerage_connections')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('authorization_id', authorizationId);
    } else {
      await supabase.from('snaptrade_users').delete().eq('user_id', userId);
      await supabase
        .from('brokerage_connections')
        .update({ is_active: false })
        .eq('user_id', userId);
    }

    return NextResponse.json({
      success: true,
      disconnected: true,
      ...(snaptradeError && { warning: 'Removed locally; SnapTrade-side cleanup failed (stale credentials).' }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Disconnect failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
