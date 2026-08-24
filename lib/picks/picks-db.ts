/**
 * Database access for Bull's Weekly Pick, plus the tier boundary.
 *
 * `toDetail()` is the single place that decides whether a caller sees the
 * thesis. Everything else about a pick — the ticker, the one-liner, the entry
 * price, and every past result including the losses — is free by design: the
 * track record is only worth something if anyone can check it.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { Tier } from '@/lib/billing/tier';
import type { CatalystType, Horizon, PickRisk, StoredThesis } from '@/lib/ai/picks/schema';
import type { PickDetail, PickSummary, PickWithPerformance } from './types';

/** Columns needed for a summary row + the performance maths. */
export const PICK_SUMMARY_COLUMNS =
  'pick_date, symbol, company_name, logo_url, sector, headline, one_liner, catalyst_type, ' +
  'conviction, horizon, entry_price, benchmark_entry_price, status, close_price, close_date, close_reason';

/** Summary columns plus the Pro payload and provenance. */
export const PICK_DETAIL_COLUMNS =
  `${PICK_SUMMARY_COLUMNS}, thesis, risks, metrics_snapshot, model, generated_at`;

export interface PickRow {
  pick_date: string;
  symbol: string;
  company_name: string | null;
  logo_url: string | null;
  sector: string | null;
  headline: string;
  one_liner: string;
  catalyst_type: string;
  conviction: number;
  horizon: string;
  entry_price: number | null;
  benchmark_entry_price: number | null;
  status: string;
  close_price: number | null;
  close_date: string | null;
  close_reason: string | null;
}

export interface PickDetailRow extends PickRow {
  thesis: unknown;
  risks: unknown;
  metrics_snapshot: unknown;
  model: string;
  generated_at: string;
}

/**
 * Postgres NUMERIC arrives as a string through PostgREST. Coerce defensively so
 * a price never reaches the return maths as "182.4400" and silently concatenates.
 */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function rowToSummary(row: PickRow): PickSummary {
  return {
    pickDate: row.pick_date,
    symbol: row.symbol,
    companyName: row.company_name,
    logoUrl: row.logo_url,
    sector: row.sector,
    headline: row.headline,
    oneLiner: row.one_liner,
    catalystType: row.catalyst_type as CatalystType,
    conviction: row.conviction,
    horizon: row.horizon as Horizon,
    entryPrice: num(row.entry_price),
    status: row.status === 'closed' ? 'closed' : 'published',
    closePrice: num(row.close_price),
    closeDate: row.close_date,
    closeReason: row.close_reason,
  };
}

/** Normalize NUMERIC strings in place so downstream maths sees real numbers. */
export function coerceRowNumerics<T extends PickRow>(row: T): T {
  row.entry_price = num(row.entry_price);
  row.benchmark_entry_price = num(row.benchmark_entry_price);
  row.close_price = num(row.close_price);
  return row;
}

/**
 * Build the detail payload for a viewer. Callers the resolved access says are
 * NOT unlocked get the response with `thesis`/`risks`/`metricsSnapshot`
 * absent entirely — not blanked, not truncated — so that content never
 * reaches the client at all. `access.unlocked` (see lib/picks/thesis-access.ts)
 * is Pro OR a spent/available free-monthly slot, not raw tier — a free user
 * can be unlocked, and lockReason explains why a non-Pro caller isn't.
 */
export function toDetail(
  row: PickDetailRow,
  perf: Pick<PickWithPerformance, 'currentPrice' | 'returnPct' | 'benchmarkReturnPct'>,
  access: { tier: Tier; unlocked: boolean; lockReason?: 'anonymous' | 'free_quota_used' }
): PickDetail {
  const base: PickDetail = {
    ...rowToSummary(row),
    ...perf,
    model: row.model,
    generatedAt: row.generated_at,
    locked: !access.unlocked,
    ...(access.lockReason ? { lockReason: access.lockReason } : {}),
  };

  if (!access.unlocked) return base;

  return {
    ...base,
    thesis: row.thesis as StoredThesis,
    risks: (row.risks ?? []) as PickRisk[],
    metricsSnapshot: (row.metrics_snapshot ?? {}) as Record<string, unknown>,
  };
}

/** The most recent published pick, or null before the first one ships. */
export async function getLatestPickRow(): Promise<PickDetailRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('ai_stock_picks')
    .select(PICK_DETAIL_COLUMNS)
    .order('pick_date', { ascending: false })
    .limit(1)
    .maybeSingle<PickDetailRow>();

  if (error || !data) return null;
  return coerceRowNumerics(data);
}

/** One pick by its publication date (the canonical URL key). */
export async function getPickRowByDate(pickDate: string): Promise<PickDetailRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('ai_stock_picks')
    .select(PICK_DETAIL_COLUMNS)
    .eq('pick_date', pickDate)
    .maybeSingle<PickDetailRow>();

  if (error || !data) return null;
  return coerceRowNumerics(data);
}
