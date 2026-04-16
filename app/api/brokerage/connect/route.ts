// POST /api/brokerage/connect
// Registers the user with SnapTrade if needed, then returns a one-time
// redirect URI for the SnapTrade broker-selection portal.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getSnapTradeClient, isSnapTradeConfigured } from '@/lib/snaptrade/client';

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { error: 'Brokerage integration is not configured on this server.' },
      { status: 503 }
    );
  }

  const supabase = createServerClient();
  const snaptrade = getSnapTradeClient();

  try {
    // Ensure user is registered — register if not
    let { data: snapUser } = await supabase
      .from('snaptrade_users')
      .select('snaptrade_user_id, user_secret')
      .eq('user_id', userId)
      .maybeSingle();

    if (!snapUser) {
      const { data: regData } = await snaptrade.authentication.registerSnapTradeUser({
        userId,
      });
      const userSecret = (regData as { userSecret?: string })?.userSecret;
      if (!userSecret) throw new Error('SnapTrade registration failed');

      await supabase.from('snaptrade_users').insert({
        user_id: userId,
        snaptrade_user_id: userId,
        user_secret: userSecret,
      });

      snapUser = { snaptrade_user_id: userId, user_secret: userSecret };
    }

    // Determine callback URL from the request origin
    const origin =
      request.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    const redirectURI = `${origin}/brokerage/callback`;

    const { data: loginData } = await snaptrade.authentication.loginSnapTradeUser(
      {
        userId: snapUser.snaptrade_user_id,
        userSecret: snapUser.user_secret,
      },
      {
        redirectURI,
        // broker: undefined → lets the user pick their broker in the portal
      }
    );

    const uri = (loginData as { redirectURI?: string })?.redirectURI;
    if (!uri) throw new Error('SnapTrade did not return a redirect URI');

    return NextResponse.json({ success: true, redirectURI: uri });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connect failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
