import { NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier } from '@/lib/billing/tier';

export interface CostsResponse {
  totalUsd7d: number;
  totalCalls7d: number;
  perFeature: { feature: string; calls: number; cost_usd: number }[];
  topUsers: { user_id: string | null; email: string | null; calls: number; cost_usd: number }[];
  recent: {
    id: string;
    user_id: string | null;
    feature: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number;
    status: string;
    created_at: string;
  }[];
}

interface UsageRow {
  id: string;
  user_id: string | null;
  feature: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | string;
  status: string;
  created_at: string;
}

async function handler(
  _req: unknown,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // Admin-only (tier === 'admin' or 'pro' — restrict here to admin for safety)
  const tier = await getTier(session.userId);
  if (tier !== 'admin') {
    return addSecurityHeaders(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
  }

  const supabase = createServerClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull all rows for the 7-day window (volume should be small while Stage A is fresh)
  const { data: rows, error } = await supabase
    .from('ai_usage')
    .select('id, user_id, feature, model, input_tokens, output_tokens, cost_usd, status, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const allRows: UsageRow[] = (rows ?? []) as UsageRow[];

  // Aggregate totals
  let totalUsd7d = 0;
  let totalCalls7d = 0;
  const perFeatureMap = new Map<string, { calls: number; cost_usd: number }>();
  const perUserMap = new Map<string | null, { calls: number; cost_usd: number }>();

  for (const r of allRows) {
    const cost = Number(r.cost_usd) || 0;
    totalUsd7d += cost;
    totalCalls7d += 1;

    const f = perFeatureMap.get(r.feature) ?? { calls: 0, cost_usd: 0 };
    f.calls += 1;
    f.cost_usd += cost;
    perFeatureMap.set(r.feature, f);

    const u = perUserMap.get(r.user_id) ?? { calls: 0, cost_usd: 0 };
    u.calls += 1;
    u.cost_usd += cost;
    perUserMap.set(r.user_id, u);
  }

  const perFeature = [...perFeatureMap.entries()]
    .map(([feature, stats]) => ({ feature, ...stats }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const topUserIds = [...perUserMap.entries()]
    .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
    .slice(0, 10);

  // Look up emails for top users (mask before returning)
  const userIds = topUserIds.map(([id]) => id).filter((id): id is string => !!id);
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, email').in('id', userIds)
    : { data: [] as { id: string; email: string }[] };
  const emailMap = new Map((users ?? []).map((u) => [u.id, u.email]));

  const topUsers = topUserIds.map(([user_id, stats]) => ({
    user_id,
    email: user_id ? maskEmail(emailMap.get(user_id) ?? null) : null,
    calls: stats.calls,
    cost_usd: Number(stats.cost_usd.toFixed(6)),
  }));

  // Recent 50 calls
  const recent = allRows.slice(0, 50).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    feature: r.feature,
    model: r.model,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: Number(r.cost_usd),
    status: r.status,
    created_at: r.created_at,
  }));

  const response: CostsResponse = {
    totalUsd7d: Number(totalUsd7d.toFixed(6)),
    totalCalls7d,
    perFeature: perFeature.map((p) => ({ ...p, cost_usd: Number(p.cost_usd.toFixed(6)) })),
    topUsers,
    recent,
  };

  return addSecurityHeaders(NextResponse.json(response));
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export const GET = withAuth(handler);
