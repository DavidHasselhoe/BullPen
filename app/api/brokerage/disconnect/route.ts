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

  try {
    if (isSnapTradeConfigured()) {
      const snaptrade = getSnapTradeClient();

      if (authorizationId) {
        // Disconnect a single brokerage authorization
        await snaptrade.connections.removeBrokerageAuthorization({
          authorizationId,
          userId: snapUser.snaptrade_user_id,
          userSecret: snapUser.user_secret,
        });

        // Mark that account as inactive in our DB
        await supabase
          .from('brokerage_connections')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('authorization_id', authorizationId);
      } else {
        // Delete the entire SnapTrade user — removes all connections
        await snaptrade.authentication.deleteSnapTradeUser({
          userId: snapUser.snaptrade_user_id,
        });

        // Remove local credential and mark all accounts inactive
        await supabase.from('snaptrade_users').delete().eq('user_id', userId);
        await supabase
          .from('brokerage_connections')
          .update({ is_active: false })
          .eq('user_id', userId);
      }
    } else {
      // SnapTrade not configured — just clean up local records
      if (!authorizationId) {
        await supabase.from('snaptrade_users').delete().eq('user_id', userId);
      }
      await supabase
        .from('brokerage_connections')
        .update({ is_active: false })
        .eq('user_id', userId);
    }

    return NextResponse.json({ success: true, disconnected: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Disconnect failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
