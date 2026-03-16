import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getStockCandlesLongRange, TwelveDataRateLimitError } from '@/lib/market-data';
import { getCompanyIndexByTicker } from '@/lib/search/search-db';
import { withRateLimit } from '@/lib/security/api-security';

export interface BuyHereRequest {
  ticker: string;
  amount: number;
  from: string; // YYYY-MM-DD
  compareSpy?: boolean;
}

export interface BuyHereResult {
  success: boolean;
  error?: string;
  stock?: {
    ticker: string;
    shares: number;
    priceAtStart: number;
    priceAtEnd: number;
    valueNow: number;
    returnPct: number;
    startDate: string;
    endDate: string;
  };
  spy?: {
    shares: number;
    priceAtStart: number;
    priceAtEnd: number;
    valueNow: number;
    returnPct: number;
  };
  chartData?: Array<{
    date: string;
    stockValue: number;
    spyValue?: number;
  }>;
}

async function buyHereHandler(request: NextRequest) {
  try {
    const body: BuyHereRequest = await request.json();
    const { ticker, amount, from, compareSpy = true } = body;

    if (!ticker || !amount || amount <= 0 || !from) {
      return NextResponse.json(
        { success: false, error: 'Missing ticker, amount, or from date' },
        { status: 400 }
      );
    }

    const symbol = ticker.toUpperCase().trim();
    const fromDate = new Date(from);
    const toDate = new Date();

    if (isNaN(fromDate.getTime()) || fromDate > toDate) {
      return NextResponse.json(
        { success: false, error: 'Invalid from date' },
        { status: 400 }
      );
    }

    // Validate ticker exists in our index (ensures valid US ticker format)
    const indexResult = await getCompanyIndexByTicker(symbol);
    if (!indexResult.success || !indexResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: `Stock "${symbol}" not found. Use the search to select a valid stock.`,
        },
        { status: 400 }
      );
    }

    // Fetch historical candles for stock and optionally SPY
    const [stockCandles, spyCandles] = await Promise.all([
      getStockCandlesLongRange(symbol, fromDate, toDate),
      compareSpy ? getStockCandlesLongRange('SPY', fromDate, toDate) : null,
    ]);

    if (!stockCandles.t.length || stockCandles.c.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No historical price data found for ${symbol} from ${from}. The data provider may not support this symbol or date range.`,
      });
    }

    const priceAtStart = stockCandles.c[0];
    const priceAtEnd = stockCandles.c[stockCandles.c.length - 1];
    const shares = amount / priceAtStart;
    const valueNow = shares * priceAtEnd;
    const returnPct = ((valueNow - amount) / amount) * 100;
    const startDateStr = new Date(stockCandles.t[0] * 1000).toISOString().slice(0, 10);
    const endDateStr = new Date(stockCandles.t[stockCandles.t.length - 1] * 1000).toISOString().slice(0, 10);

    const result: BuyHereResult = {
      success: true,
      stock: {
        ticker: symbol,
        shares,
        priceAtStart,
        priceAtEnd,
        valueNow,
        returnPct,
        startDate: startDateStr,
        endDate: endDateStr,
      },
    };

    if (compareSpy && spyCandles && spyCandles.t.length > 0) {
      const spyPriceAtStart = spyCandles.c[0];
      const spyPriceAtEnd = spyCandles.c[spyCandles.c.length - 1];
      const spyShares = amount / spyPriceAtStart;
      const spyValueNow = spyShares * spyPriceAtEnd;
      const spyReturnPct = ((spyValueNow - amount) / amount) * 100;

      result.spy = {
        shares: spyShares,
        priceAtStart: spyPriceAtStart,
        priceAtEnd: spyPriceAtEnd,
        valueNow: spyValueNow,
        returnPct: spyReturnPct,
      };

      // Build chart data - use stock dates, match SPY by most recent date <= stock date
      const spyTuples = spyCandles.t.map((t, i) => ({
        time: t * 1000,
        value: (amount / spyPriceAtStart) * spyCandles.c[i],
      }));

      result.chartData = stockCandles.t.map((ts, i) => {
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        const stockVal = (amount / priceAtStart) * stockCandles.c[i];
        const stockTime = ts * 1000;
        const spyTuple = spyTuples.filter((t) => t.time <= stockTime).pop();
        return {
          date,
          stockValue: stockVal,
          spyValue: spyTuple?.value,
        };
      });
    } else {
      // No SPY comparison - chart with stock only
      result.chartData = stockCandles.t.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        stockValue: (amount / priceAtStart) * stockCandles.c[i],
      }));
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    logger.error('Buy-here calculator error', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    const is403 = msg.includes('403') || msg.includes('Forbidden');
    return NextResponse.json(
      {
        success: false,
        error: is403
          ? 'Historical data unavailable. Please check your API key has access to stock candles, or try again later.'
          : msg,
      },
      { status: 500 }
    );
  }
}

/** Rate limited: 10/min to protect Twelve Data API usage */
export const POST = withRateLimit(buyHereHandler, { windowMs: 60 * 1000, maxRequests: 10 });
