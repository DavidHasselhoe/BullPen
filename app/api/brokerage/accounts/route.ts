// GET /api/brokerage/accounts
// Returns connected brokerage accounts for the current user.
// Combines data from our DB (last_synced_at, is_active) with live SnapTrade account info.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getSnapTradeClient, isSnapTradeConfigured } from '@/lib/snaptrade/client';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  // Check if the user is registered with SnapTrade
  const { data: snapUser } = await supabase
    .from('snaptrade_users')
    .select('snaptrade_user_id, user_secret')
    .eq('user_id', userId)
    .maybeSingle();

  if (!snapUser) {
    return NextResponse.json({
      success: true,
      registered: false,
      configured: isSnapTradeConfigured(),
      accounts: [],
    });
  }

  // Fetch locally stored connection metadata
  const { data: dbConnections } = await supabase
    .from('brokerage_connections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (!isSnapTradeConfigured()) {
    return NextResponse.json({
      success: true,
      registered: true,
      configured: false,
      accounts: dbConnections ?? [],
    });
  }

  try {
    const snaptrade = getSnapTradeClient();

    // Fetch live account list from SnapTrade to detect newly added accounts
    const { data: liveAccounts } = await snaptrade.accountInformation.listUserAccounts({
      userId: snapUser.snaptrade_user_id,
      userSecret: snapUser.user_secret,
    });

    // Upsert new accounts we haven't seen before
    for (const acct of Array.isArray(liveAccounts) ? liveAccounts as Array<{ id: string; name?: string; number?: string; type?: string; brokerage_authorization?: { brokerage?: { name?: string; slug?: string } } }> : []) {
      const brokerage = acct.brokerage_authorization?.brokerage;
      await supabase.from('brokerage_connections').upsert(
        {
          user_id: userId,
          snaptrade_account_id: acct.id,
          account_name: acct.name ?? null,
          brokerage_name: brokerage?.name ?? null,
          brokerage_slug: brokerage?.slug ?? null,
          account_number: acct.number ?? null,
          account_type: acct.type ?? null,
          is_active: true,
        },
        { onConflict: 'user_id,snaptrade_account_id', ignoreDuplicates: false }
      );
    }

    // Re-fetch updated DB connections
    const { data: updatedConnections } = await supabase
      .from('brokerage_connections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    // Mark accounts no longer in SnapTrade as inactive
    const liveIds = new Set(
      (Array.isArray(liveAccounts) ? liveAccounts : []).map((a: { id: string }) => a.id)
    );

    for (const conn of updatedConnections ?? []) {
      if (!liveIds.has(conn.snaptrade_account_id) && conn.is_active) {
        await supabase
          .from('brokerage_connections')
          .update({ is_active: false })
          .eq('id', conn.id);
      }
    }

    return NextResponse.json({
      success: true,
      registered: true,
      configured: true,
      accounts: updatedConnections ?? [],
    });
  } catch (err) {
    // Return DB data even if SnapTrade call fails
    const msg = err instanceof Error ? err.message : 'Failed to fetch accounts';
    return NextResponse.json({
      success: true,
      registered: true,
      configured: isSnapTradeConfigured(),
      accounts: dbConnections ?? [],
      warning: msg,
    });
  }
}
