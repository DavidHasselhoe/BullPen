// POST /api/brokerage/register
// Registers the current user with SnapTrade and persists their userSecret.
// Idempotent — calling again returns existing registration.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getSnapTradeClient, isSnapTradeConfigured } from '@/lib/snaptrade/client';
import { getTier, isPro } from '@/lib/billing/tier';

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pro-only — see app/api/brokerage/connect/route.ts for the rationale.
  // Existing registrations/connections made before this gate are unaffected.
  if (!isPro(await getTier(userId))) {
    return NextResponse.json({ error: 'upgrade_required' }, { status: 403 });
  }

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { error: 'Brokerage integration is not configured on this server.' },
      { status: 503 }
    );
  }

  const supabase = createServerClient();

  // Return existing registration if present
  const { data: existing } = await supabase
    .from('snaptrade_users')
    .select('snaptrade_user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, already_registered: true });
  }

  try {
    const snaptrade = getSnapTradeClient();
    const snapUserId = userId; // reuse Supabase UUID as SnapTrade userId

    const { data } = await snaptrade.authentication.registerSnapTradeUser({
      userId: snapUserId,
    });

    const userSecret = (data as { userSecret?: string })?.userSecret;
    if (!userSecret) {
      throw new Error('SnapTrade did not return a userSecret');
    }

    const { error: insertError } = await supabase.from('snaptrade_users').insert({
      user_id: userId,
      snaptrade_user_id: snapUserId,
      user_secret: userSecret,
    });

    if (insertError) {
      throw new Error(`Failed to persist SnapTrade credentials: ${insertError.message}`);
    }

    return NextResponse.json({ success: true, already_registered: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
