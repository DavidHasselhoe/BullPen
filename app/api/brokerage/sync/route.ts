// POST /api/brokerage/sync
// Fetches all positions from connected brokerages via SnapTrade and upserts them
// into user_holdings. Holdings are aggregated by symbol across all accounts.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getSnapTradeClient, isSnapTradeConfigured } from '@/lib/snaptrade/client';

interface AggregatedPosition {
  symbol: string;
  company_name: string;
  totalQuantity: number;
  weightedAvgPrice: number | null;
  totalCost: number;
  primaryAccountId: string;
}

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSnapTradeConfigured()) {
    return NextResponse.json({ error: 'Brokerage integration not configured' }, { status: 503 });
  }

  const supabase = createServerClient();

  // Fetch stored SnapTrade credentials
  const { data: snapUser } = await supabase
    .from('snaptrade_users')
    .select('snaptrade_user_id, user_secret')
    .eq('user_id', userId)
    .maybeSingle();

  if (!snapUser) {
    return NextResponse.json({ error: 'No brokerage connection found. Connect first.' }, { status: 400 });
  }

  try {
    const snaptrade = getSnapTradeClient();

    // Fetch all holdings across all connected accounts in one call
    const { data: allHoldings } = await snaptrade.accountInformation.getAllUserHoldings({
      userId: snapUser.snaptrade_user_id,
      userSecret: snapUser.user_secret,
    });

    const accountsData = Array.isArray(allHoldings) ? allHoldings : [];

    // Aggregate positions by symbol (sum quantities, compute weighted avg price)
    const positionMap = new Map<string, AggregatedPosition>();

    for (const accountData of accountsData) {
      const account = (accountData as { account?: { id?: string } }).account;
      const positions = (accountData as { positions?: unknown[] }).positions ?? [];
      const accountId = account?.id ?? 'unknown';

      for (const pos of positions) {
        const p = pos as {
          symbol?: {
            symbol?: { symbol?: string; description?: string };
          };
          units?: number;
          fractional_units?: number | null;
          average_purchase_price?: number | null;
        };

        const ticker = p.symbol?.symbol?.symbol;
        const companyName = p.symbol?.symbol?.description ?? ticker ?? '';
        const quantity = (p.units ?? 0) + (p.fractional_units ?? 0);
        const avgPrice = p.average_purchase_price ?? null;

        if (!ticker || quantity <= 0) continue;

        const existing = positionMap.get(ticker);
        if (existing) {
          // Weighted average across accounts
          const prevCost = existing.totalCost;
          const newCost = avgPrice != null ? avgPrice * quantity : 0;
          existing.totalQuantity += quantity;
          existing.totalCost = prevCost + newCost;
          existing.weightedAvgPrice =
            avgPrice != null || existing.weightedAvgPrice != null
              ? existing.totalCost / existing.totalQuantity
              : null;
        } else {
          positionMap.set(ticker, {
            symbol: ticker.toUpperCase(),
            company_name: companyName,
            totalQuantity: quantity,
            weightedAvgPrice: avgPrice,
            totalCost: avgPrice != null ? avgPrice * quantity : 0,
            primaryAccountId: accountId,
          });
        }
      }
    }

    if (positionMap.size === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        accounts: accountsData.length,
        message: 'No positions found in connected accounts.',
      });
    }

    // Upsert all positions into user_holdings
    const rows = Array.from(positionMap.values()).map((pos) => ({
      user_id: userId,
      symbol: pos.symbol,
      company_name: pos.company_name,
      quantity: pos.totalQuantity,
      avg_price: pos.weightedAvgPrice,
      source: 'snaptrade',
      brokerage_account_id: pos.primaryAccountId,
    }));

    const { error: upsertError } = await supabase
      .from('user_holdings')
      .upsert(rows, {
        onConflict: 'user_id,symbol',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      throw new Error(`Failed to save positions: ${upsertError.message}`);
    }

    // Update last_synced_at for all connected accounts
    const accountIds = accountsData
      .map((a) => (a as { account?: { id?: string } }).account?.id)
      .filter(Boolean) as string[];

    if (accountIds.length > 0) {
      await supabase
        .from('brokerage_connections')
        .update({ last_synced_at: new Date().toISOString(), is_active: true })
        .eq('user_id', userId)
        .in('snaptrade_account_id', accountIds);
    }

    return NextResponse.json({
      success: true,
      synced: rows.length,
      accounts: accountsData.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
