import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import type { DeepDiveLens, Verdict } from '@/lib/ai/deep-dive/schema';

export interface SavedDivePreview {
  id: string;
  symbol: string;
  companyName: string | null;
  lens: DeepDiveLens;
  headline: string | null;
  stance: Verdict['stance'] | null;
  createdAt: string;
}

// GET: list the current user's saved deep dives (lightweight — no full report body).
async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // JSON-path aliases (headline, stance) aren't inferable from the typed schema,
  // so override the row type explicitly with .returns<>().
  type ListRow = {
    id: string; symbol: string; company_name: string | null; lens: string;
    created_at: string; headline: string | null; stance: string | null;
  };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('stock_deep_dives')
    .select('id, symbol, company_name, lens, created_at, headline:report->>headline, stance:report->verdict->>stance')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<ListRow[]>();

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const dives: SavedDivePreview[] = (data ?? []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    companyName: row.company_name ?? null,
    lens: (row.lens as DeepDiveLens) ?? 'full',
    headline: row.headline ?? null,
    stance: (row.stance as Verdict['stance'] | null) ?? null,
    createdAt: row.created_at,
  }));

  return addSecurityHeaders(NextResponse.json({ dives }));
}

// DELETE: remove a saved dive by id (scoped to the owner).
async function deleteHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return addSecurityHeaders(NextResponse.json({ error: 'Missing id' }, { status: 400 }));

  const supabase = createServerClient();
  await supabase.from('stock_deep_dives').delete().eq('id', id).eq('user_id', session.userId);
  return addSecurityHeaders(NextResponse.json({ ok: true }));
}

export const GET = withAuth(getHandler);
export const DELETE = withAuth(deleteHandler);
