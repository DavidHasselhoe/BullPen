import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import type { Database } from '@/lib/supabase/types';

export interface SavedRiskAnalysis {
  id: string;
  currency: string;
  holdingsCount: number | null;
  createdAt: string;
  overallRiskScore: number;
  riskLevel: string;
}

async function getHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  type RiskRow = Database['public']['Tables']['risk_analyses']['Row'];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('risk_analyses')
    .select('id, currency, holdings_count, created_at, analysis')
    .eq('user_id', session.userId)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(10)
    .returns<RiskRow[]>();

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const analyses: SavedRiskAnalysis[] = (data ?? []).map((row) => {
    const a = row.analysis as { overallRiskScore?: number; riskLevel?: string } | null;
    return {
      id: row.id,
      currency: row.currency,
      holdingsCount: row.holdings_count ?? null,
      createdAt: row.created_at,
      overallRiskScore: a?.overallRiskScore ?? 0,
      riskLevel: a?.riskLevel ?? '—',
    };
  });

  return addSecurityHeaders(NextResponse.json({ analyses }));
}

async function deleteHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return addSecurityHeaders(NextResponse.json({ error: 'Missing id' }, { status: 400 }));

  const supabase = createServerClient();
  await supabase.from('risk_analyses').delete().eq('id', id).eq('user_id', session.userId);
  return addSecurityHeaders(NextResponse.json({ ok: true }));
}

// GET a saved analysis by ID (to restore it)
async function getOneHandler(id: string, userId: string): Promise<NextResponse> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('risk_analyses')
    .select('id, currency, holdings_count, created_at, analysis')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return addSecurityHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }));

  return addSecurityHeaders(NextResponse.json({
    id: data.id,
    currency: data.currency,
    holdingsCount: data.holdings_count,
    createdAt: data.created_at,
    analysis: data.analysis,
  }));
}

async function combinedGetHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get('id');
  if (id) return getOneHandler(id, session.userId);
  return getHandler(req, _ctx, session);
}

export const GET    = withAuth(combinedGetHandler);
export const DELETE = withAuth(deleteHandler);
