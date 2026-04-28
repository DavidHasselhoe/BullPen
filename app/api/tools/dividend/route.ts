import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import {
  getDividends,
  getStockQuote,
  getStatistics,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit } from '@/lib/security/api-security';

interface DividendRequest {
  ticker: string;
  sharesOrAmount: number;
  mode: 'shares' | 'amount';
  years: number;
  drip: boolean;
}

interface YearResult {
  year: number;
  annualIncome: number;
  cumulativeIncome: number;
  shares: number;
  portfolioValue: number;
}

interface DividendResult {
  success: boolean;
  error?: string;
  ticker?: string;
  sharesStart?: number;
  currentPrice?: number;
  annualDividendPerShare?: number;
  dividendYield?: number;
  currency?: string;
  years?: YearResult[];
  breakEvenYear?: number | null;
  totalIncome?: number;
  finalPortfolioValue?: number;
}

function computeAnnualDividendPerShare(
  dividends: { ex_dividend_date: string; amount: number }[]
): number {
  if (dividends.length === 0) return 0;

  const sorted = [...dividends].sort(
    (a, b) => new Date(b.ex_dividend_date).getTime() - new Date(a.ex_dividend_date).getTime()
  );

  const cutoff = new Date(sorted[0].ex_dividend_date);
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  const ttm = sorted.filter(d => new Date(d.ex_dividend_date) >= cutoff && d.amount > 0);
  if (ttm.length >= 1) return ttm.reduce((sum, d) => sum + d.amount, 0);

  // Fewer than a full year of data — extrapolate from available, assume quarterly cadence
  const valid = sorted.filter(d => d.amount > 0);
  if (valid.length === 0) return 0;
  const avg = valid.reduce((s, d) => s + d.amount, 0) / valid.length;
  return avg * 4;
}

async function dividendHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const body: DividendRequest = await request.json();
    const { ticker, sharesOrAmount, mode, years, drip } = body;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ success: false, error: 'ticker is required' }, { status: 400 });
    }
    if (!sharesOrAmount || sharesOrAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'sharesOrAmount must be a positive number' },
        { status: 400 }
      );
    }
    if (!years || years < 1 || years > 50) {
      return NextResponse.json(
        { success: false, error: 'years must be between 1 and 50' },
        { status: 400 }
      );
    }

    const symbol = ticker.toUpperCase().trim();

    const [dividends, quote, stats] = await Promise.all([
      getDividends(symbol),
      getStockQuote(symbol),
      getStatistics(symbol).catch(() => null),
    ]);

    const currentPrice = quote.c;
    if (!currentPrice || currentPrice <= 0) {
      return NextResponse.json(
        { success: false, error: `Could not retrieve a valid price for ${symbol}` }
      );
    }

    const annualDividendPerShare = computeAnnualDividendPerShare(dividends);
    const currency = dividends[0]?.currency ?? 'USD';
    const dividendYield = stats?.dividendYield ?? (annualDividendPerShare / currentPrice) * 100;

    const sharesStart = mode === 'amount' ? sharesOrAmount / currentPrice : sharesOrAmount;
    const initialCost = mode === 'amount' ? sharesOrAmount : sharesStart * currentPrice;

    const yearResults: YearResult[] = [];
    let shares = sharesStart;
    let cumulativeIncome = 0;
    let breakEvenYear: number | null = null;

    for (let y = 1; y <= years; y++) {
      const annualIncome = shares * annualDividendPerShare;
      cumulativeIncome += annualIncome;

      if (drip) shares += annualIncome / currentPrice;

      yearResults.push({
        year: y,
        annualIncome,
        cumulativeIncome,
        shares,
        portfolioValue: shares * currentPrice,
      });

      if (
        mode === 'amount' &&
        breakEvenYear === null &&
        annualDividendPerShare > 0 &&
        cumulativeIncome >= initialCost
      ) {
        breakEvenYear = y;
      }
    }

    const result: DividendResult = {
      success: true,
      ticker: symbol,
      sharesStart,
      currentPrice,
      annualDividendPerShare,
      dividendYield,
      currency,
      years: yearResults,
      breakEvenYear: mode === 'amount' ? breakEvenYear : null,
      totalIncome: cumulativeIncome,
      finalPortfolioValue: yearResults[yearResults.length - 1]?.portfolioValue ?? sharesStart * currentPrice,
    };

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: 'Market data rate limit reached. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    logger.error('Dividend calculator error', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withRateLimit(dividendHandler, { windowMs: 60_000, maxRequests: 10 });
