/**
 * User Alerts — CRUD endpoints.
 *
 *  GET  /api/alerts        → list the user's alerts (newest first)
 *  POST /api/alerts        → create an alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { getStockCandlesLongRange } from '@/lib/twelvedata/twelvedata-client';
import { humanizeError } from '@/lib/errors/humanize';
import {
  CreateAlertPayloadSchema,
  FREE_ACTIVE_ALERT_LIMIT,
  type UserAlert,
} from '@/types/alerts';

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  alert_type: UserAlert['alertType'];
  threshold: number;
  baseline_value: number | null;
  is_active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

function toClient(row: AlertRow): UserAlert {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    companyName: row.company_name,
    alertType: row.alert_type,
    threshold: Number(row.threshold),
    baselineValue: row.baseline_value === null ? null : Number(row.baseline_value),
    isActive: row.is_active,
    lastTriggeredAt: row.last_triggered_at,
    triggerCount: row.trigger_count,
    createdAt: row.created_at,
  };
}

// ─── GET /api/alerts ─────────────────────────────────────────────────────────

async function listHandler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_alerts')
    .select('*')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: humanizeError(error) }, { status: 500 })
    );
  }

  const alerts = ((data ?? []) as AlertRow[]).map(toClient);
  return addSecurityHeaders(NextResponse.json({ success: true, alerts }));
}

// ─── POST /api/alerts ────────────────────────────────────────────────────────
//
// Resolves the ATH baseline for `all_time_high` alerts server-side so the
// client never has to know about it. Enforces the free-tier active-alerts cap.

async function createHandler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  let payload;
  try {
    payload = CreateAlertPayloadSchema.parse(await req.json());
  } catch (err) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid alert details. ' + humanizeError(err) }, { status: 400 })
    );
  }

  const supabase = createServerClient();

  // Enforce free-tier cap on ACTIVE stocks (distinct symbols), not individual alert rows.
  // Adding a second condition to an already-watched stock doesn't consume a new slot.
  const tier = await getTier(session.userId);
  if (!isPro(tier)) {
    const { data: activeRows } = await supabase
      .from('user_alerts')
      .select('symbol')
      .eq('user_id', session.userId)
      .eq('is_active', true);
    const activeSymbols = new Set((activeRows ?? []).map((r) => r.symbol as string));
    const isNewSymbol = !activeSymbols.has(payload.symbol);
    if (isNewSymbol && activeSymbols.size >= FREE_ACTIVE_ALERT_LIMIT) {
      return addSecurityHeaders(
        NextResponse.json(
          {
            success: false,
            code: 'free_limit_reached',
            error: `You've reached the free tier limit — ${FREE_ACTIVE_ALERT_LIMIT} stocks with active alerts. Pause alerts on a stock to free up a slot, or upgrade to Pro for unlimited.`,
          },
          { status: 402 }
        )
      );
    }
  }

  // Resolve the ATH baseline once at creation time. This is the only alert
  // type that needs historical data; the cron then incrementally updates
  // baseline_value when a new high is observed.
  let baselineValue: number | null = null;
  if (payload.alertType === 'all_time_high') {
    try {
      const to = new Date();
      const from = new Date();
      from.setFullYear(from.getFullYear() - 20);
      const candles = await getStockCandlesLongRange(payload.symbol, from, to);
      if (candles.c.length > 0) {
        baselineValue = Math.max(...candles.c);
      }
    } catch (err) {
      // Not fatal — set baseline to null and let the first cron run resolve it
      console.warn('[POST /api/alerts] ATH baseline lookup failed:', err);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from('user_alerts')
    .insert({
      user_id:        session.userId,
      symbol:         payload.symbol,
      company_name:   payload.companyName ?? null,
      alert_type:     payload.alertType,
      threshold:      payload.threshold,
      baseline_value: baselineValue,
    })
    .select('*')
    .single();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: humanizeError(error) }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json({ success: true, alert: toClient(data as AlertRow) }, { status: 201 })
  );
}

export const GET  = withAuth(listHandler,   { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
export const POST = withAuth(createHandler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
