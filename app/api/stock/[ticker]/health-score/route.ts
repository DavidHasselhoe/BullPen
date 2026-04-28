import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import {
  getStatistics,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  TwelveDataRateLimitError,
  type CompanyStatistics,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';

const STATS_TTL = 60 * 60;        // 1 hour — matches /statistics route
const FINANCIALS_TTL = 24 * 60 * 60; // 24 hours — matches /financials route

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    // ── Statistics (50 credits if cold) — read cache seeded by snapshot route ──
    let stats = await getCached<CompanyStatistics>(`stats:${symbol}`);
    if (!stats) {
      stats = await getStatistics(symbol);
      await setCached(`stats:${symbol}`, symbol, 'statistics', stats, STATS_TTL).catch(() => {});
    }

    // ── Income statement (20 credits if cold) — shared cache key with /financials ──
    let income = await getCached<IncomeStatementPeriod[]>(`financials:${symbol}:income:quarterly`);
    if (!income) {
      income = await getIncomeStatement(symbol, 'quarterly').catch(() => []);
      if (income.length) {
        await setCached(`financials:${symbol}:income:quarterly`, symbol, 'financials', income, FINANCIALS_TTL).catch(() => {});
      }
    }

    // ── Balance sheet (15 credits if cold) — shared cache key with /financials ──
    let balance = await getCached<BalanceSheetPeriod[]>(`financials:${symbol}:balance:quarterly`);
    if (!balance) {
      balance = await getBalanceSheet(symbol, 'quarterly').catch(() => []);
      if (balance.length) {
        await setCached(`financials:${symbol}:balance:quarterly`, symbol, 'financials', balance, FINANCIALS_TTL).catch(() => {});
      }
    }

    // ── Cash flow (15 credits if cold) — shared cache key with /financials ──
    let cashflow = await getCached<CashFlowPeriod[]>(`financials:${symbol}:cashflow:quarterly`);
    if (!cashflow) {
      cashflow = await getCashFlow(symbol, 'quarterly').catch(() => []);
      if (cashflow.length) {
        await setCached(`financials:${symbol}:cashflow:quarterly`, symbol, 'financials', cashflow, FINANCIALS_TTL).catch(() => {});
      }
    }

    const healthScore = computeHealthScore(stats, income ?? [], balance ?? [], cashflow ?? []);

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: healthScore },
        { headers: { 'Cache-Control': 'private, max-age=3600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 403 })
      );
    }
    console.error(`[health-score] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to compute health score' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 30 });
