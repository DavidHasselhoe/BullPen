import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import {
  getDividends,
  getStockQuotes,
  TwelveDataRateLimitError,
  type DividendItem,
} from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit } from '@/lib/security/api-security';

const MAX_HOLDINGS = 15;

interface HoldingInput {
  ticker: string;
  sharesOrAmount: number;
  mode: 'shares' | 'amount';
}

interface DividendRequest {
  holdings: HoldingInput[];
  years: number;
  drip: boolean;
}

interface PortfolioYearResult {
  year: number;
  annualIncome: number;
  cumulativeIncome: number;
  portfolioValue: number;
}

interface HoldingResult {
  ticker: string;
  mode: 'shares' | 'amount';
  sharesStart: number;
  currentPrice: number;
  annualDividendPerShare: number;
  dividendYield: number;
  currency: string;
  invested: number;
  year1Income: number;
  noDividends: boolean;
}

interface DividendResult {
  success: boolean;
  error?: string;
  holdings?: HoldingResult[];
  years?: PortfolioYearResult[];
  totalInvested?: number;
  totalIncomeYear1?: number;
  totalIncome?: number;
  finalPortfolioValue?: number;
  blendedYield?: number;
  breakEvenYear?: number | null;
  currency?: string;
}

/**
 * Trailing realized annual dividend per share from the /dividends history.
 *
 * Detects the payment frequency from the median gap between ex-dates, then sums
 * exactly one cycle of the most recent payments (the last 4 for quarterly, 12
 * for monthly, etc.). This avoids the boundary error of a naive "sum everything
 * in the last 365 days" window, which can capture an extra payment and overstate
 * the yield (e.g. KO showing ~3.1% instead of ~2.5%).
 */
function computeAnnualDividendPerShare(dividends: DividendItem[]): number {
  const valid = dividends
    .filter((d) => d.amount > 0 && d.ex_dividend_date)
    .map((d) => ({ t: new Date(d.ex_dividend_date).getTime(), a: d.amount }))
    .filter((d) => !Number.isNaN(d.t))
    .sort((a, b) => b.t - a.t);

  if (valid.length === 0) return 0;
  if (valid.length === 1) return valid[0].a * 4; // single record — assume quarterly

  const gaps: number[] = [];
  for (let i = 0; i < valid.length - 1; i++) {
    gaps.push((valid[i].t - valid[i + 1].t) / 86_400_000);
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  const freq = medianGap <= 45 ? 12 : medianGap <= 100 ? 4 : medianGap <= 200 ? 2 : 1;

  const recent = valid.slice(0, freq);
  const sum = recent.reduce((s, d) => s + d.a, 0);
  // If we don't have a full cycle yet, scale the partial sum up to a full year.
  return recent.length === freq ? sum : (sum / recent.length) * freq;
}

/** Per-holding year-by-year share count and income, optionally reinvesting (DRIP). */
function projectHolding(
  sharesStart: number,
  annualDividendPerShare: number,
  currentPrice: number,
  years: number,
  drip: boolean
): { year: number; annualIncome: number; shares: number; portfolioValue: number }[] {
  const rows: { year: number; annualIncome: number; shares: number; portfolioValue: number }[] = [];
  let shares = sharesStart;
  for (let y = 1; y <= years; y++) {
    // Income earned on shares held during the year, reinvested at year-end.
    const annualIncome = shares * annualDividendPerShare;
    if (drip && currentPrice > 0) shares += annualIncome / currentPrice;
    rows.push({ year: y, annualIncome, shares, portfolioValue: shares * currentPrice });
  }
  return rows;
}

async function dividendHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const body: DividendRequest = await request.json();
    const { holdings, years, drip } = body;

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Add at least one stock to your portfolio' },
        { status: 400 }
      );
    }
    if (holdings.length > MAX_HOLDINGS) {
      return NextResponse.json(
        { success: false, error: `A portfolio can hold up to ${MAX_HOLDINGS} stocks` },
        { status: 400 }
      );
    }
    if (!years || years < 1 || years > 50) {
      return NextResponse.json(
        { success: false, error: 'years must be between 1 and 50' },
        { status: 400 }
      );
    }

    // Normalise + de-dupe by symbol (sum amounts for the same ticker).
    const merged = new Map<string, HoldingInput>();
    for (const h of holdings) {
      if (!h?.ticker || typeof h.ticker !== 'string') continue;
      if (!h.sharesOrAmount || h.sharesOrAmount <= 0) continue;
      const sym = h.ticker.toUpperCase().trim();
      const existing = merged.get(sym);
      if (existing && existing.mode === h.mode) {
        existing.sharesOrAmount += h.sharesOrAmount;
      } else if (!existing) {
        merged.set(sym, { ticker: sym, sharesOrAmount: h.sharesOrAmount, mode: h.mode });
      }
    }
    const symbols = [...merged.keys()];
    if (symbols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Add at least one valid stock with an amount' },
        { status: 400 }
      );
    }

    // One batched quote request + one /dividends call per symbol (1 credit each).
    const [quotes, dividendLists] = await Promise.all([
      getStockQuotes(symbols),
      Promise.all(symbols.map((s) => getDividends(s).catch(() => [] as DividendItem[]))),
    ]);

    const holdingResults: HoldingResult[] = [];
    const perHoldingRows: { year: number; annualIncome: number; portfolioValue: number }[][] = [];

    symbols.forEach((sym, i) => {
      const input = merged.get(sym)!;
      const quote = quotes.get(sym);
      const currentPrice = quote?.c ?? 0;
      if (!currentPrice || currentPrice <= 0) return; // skip symbols with no price

      const dividends = dividendLists[i];
      const annualDividendPerShare = computeAnnualDividendPerShare(dividends);
      const currency = dividends[0]?.currency ?? 'USD';

      const sharesStart =
        input.mode === 'amount' ? input.sharesOrAmount / currentPrice : input.sharesOrAmount;
      const invested = sharesStart * currentPrice;

      // Yield computed from the actual dividend history ÷ price — internally
      // consistent with the income projection. (TwelveData's statistics yield is
      // a fraction and is not needed here.)
      const dividendYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0;

      const rows = projectHolding(sharesStart, annualDividendPerShare, currentPrice, years, drip);
      perHoldingRows.push(rows);

      holdingResults.push({
        ticker: sym,
        mode: input.mode,
        sharesStart,
        currentPrice,
        annualDividendPerShare,
        dividendYield,
        currency,
        invested,
        year1Income: rows[0]?.annualIncome ?? 0,
        noDividends: annualDividendPerShare === 0,
      });
    });

    if (holdingResults.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not retrieve prices for any of the selected stocks',
      });
    }

    // Aggregate per-year across holdings.
    const yearResults: PortfolioYearResult[] = [];
    let cumulativeIncome = 0;
    for (let y = 0; y < years; y++) {
      let annualIncome = 0;
      let portfolioValue = 0;
      for (const rows of perHoldingRows) {
        annualIncome += rows[y]?.annualIncome ?? 0;
        portfolioValue += rows[y]?.portfolioValue ?? 0;
      }
      cumulativeIncome += annualIncome;
      yearResults.push({ year: y + 1, annualIncome, cumulativeIncome, portfolioValue });
    }

    const totalInvested = holdingResults.reduce((s, h) => s + h.invested, 0);
    const totalIncomeYear1 = holdingResults.reduce((s, h) => s + h.year1Income, 0);
    const blendedYield = totalInvested > 0 ? (totalIncomeYear1 / totalInvested) * 100 : 0;

    let breakEvenYear: number | null = null;
    for (const row of yearResults) {
      if (totalInvested > 0 && row.cumulativeIncome >= totalInvested) {
        breakEvenYear = row.year;
        break;
      }
    }

    const result: DividendResult = {
      success: true,
      holdings: holdingResults,
      years: yearResults,
      totalInvested,
      totalIncomeYear1,
      totalIncome: cumulativeIncome,
      finalPortfolioValue: yearResults[yearResults.length - 1]?.portfolioValue ?? totalInvested,
      blendedYield,
      breakEvenYear,
      currency: 'USD',
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
