/**
 * POST /api/holdings/import
 *
 * Batch-creates holdings from a parsed CSV upload.
 * - company_name is optional: resolved from the `companies` table (0 TwelveData credits).
 *   Falls back to symbol if not found anywhere.
 * - Rows for symbols the user already holds are skipped (returned in `skipped`).
 * - Returns { imported, skipped, errors } so the client can show a result summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { addHolding } from '@/lib/holdings/holdings-db';
import { humanizeError } from '@/lib/errors/humanize';

export interface ImportRow {
  symbol: string;
  company_name?: string | null;
  quantity?: number | null;
  avg_price?: number | null;
  date_purchased?: string | null;
  asset_type?: 'stock' | 'crypto' | 'commodity' | 'forex' | 'etf' | null;
  purchase_currency?: string | null;
  trading_currency?: string | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { symbol: string; error: string }[];
}

async function handler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  let rows: ImportRow[];
  try {
    const body = await req.json();
    if (!Array.isArray(body?.rows)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rows array is required' }, { status: 400 })
      );
    }
    rows = body.rows as ImportRow[];
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    );
  }

  if (rows.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'No rows to import' }, { status: 400 })
    );
  }
  if (rows.length > 500) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Maximum 500 rows per import' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  const { userId } = session;

  // Resolve missing company names from the companies table in one query (0 API credits)
  const symbolsNeedingName = [
    ...new Set(
      rows
        .filter((r) => !r.company_name?.trim())
        .map((r) => r.symbol.toUpperCase())
    ),
  ];

  const nameMap = new Map<string, string>();
  if (symbolsNeedingName.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('ticker, name')
      .in('ticker', symbolsNeedingName);
    for (const c of companies ?? []) {
      if (c.name) nameMap.set(c.ticker, c.name);
    }
  }

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) {
      result.errors.push({ symbol: '(empty)', error: 'Symbol is required' });
      continue;
    }

    const company_name =
      row.company_name?.trim() || nameMap.get(symbol) || symbol;

    const res = await addHolding(userId, {
      symbol,
      company_name,
      quantity: row.quantity ?? null,
      avg_price: row.avg_price ?? null,
      date_purchased: row.date_purchased ?? null,
      asset_type: row.asset_type ?? 'stock',
      purchase_currency: row.purchase_currency ?? 'USD',
      purchase_fx_rate: null,
      trading_currency: row.trading_currency ?? null,
    } as Parameters<typeof addHolding>[1]);

    if (res.success) {
      result.imported++;
    } else if (res.error?.toLowerCase().includes('already exists')) {
      result.skipped++;
    } else {
      result.errors.push({ symbol, error: humanizeError(res.error) });
    }
  }

  return addSecurityHeaders(NextResponse.json({ success: true, ...result }));
}

export const POST = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 10 } });
