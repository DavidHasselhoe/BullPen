'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calculator, Loader2, AlertCircle } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  type CurrencyCode,
  convertCurrency,
  getCurrencySymbol,
} from '@/lib/currency/currency-conversion';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { makeFullFormatter, makeCompactFormatter } from '@/lib/currency/format';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { TimeSelector, PRESETS } from '@/components/tools/buy-here/TimeSelector';
import { CompareToggle } from '@/components/tools/buy-here/CompareToggle';
import { AnimatedCounter } from '@/components/tools/buy-here/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

const STORAGE_KEY = 'buy-here-last-ticker';

type BuyHereResult = {
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
};

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// Dollar gain/loss alongside the percent — valueNow minus what was actually
// put in (shares × entry price), so it stays consistent with the shares/price
// figures shown just below it, rather than the originally-typed amount which
// can differ slightly after fractional-share rounding.
function formatSignedGain(valueNow: number, shares: number, priceAtStart: number, fmtCurrency: (v: number) => string): string {
  const gain = valueNow - shares * priceAtStart;
  return `${gain >= 0 ? '+' : ''}${fmtCurrency(gain)}`;
}

// Always format with en-US commas so parseFormattedAmount can reliably strip them.
function formatAmountInput(value: string): string {
  const num = value.replace(/[^0-9]/g, '');
  if (!num) return '';
  return parseInt(num, 10).toLocaleString('en-US');
}

// Strip every non-digit character so space/period thousands separators (e.g. "200 000", "200.000") parse correctly.
function parseFormattedAmount(value: string): number {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

// ─── Chart ───────────────────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  fmtCurrency: (v: number) => string;
  /** series name → shares held, so we can show the per-share price alongside the value. */
  sharesByName?: Record<string, number>;
}

function ChartTooltip({ active, payload, label, fmtCurrency, sharesByName }: ChartTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const date = new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs min-w-[180px]">
      <p className="text-muted-foreground mb-1.5">{date}</p>
      {payload.map((entry) => {
        const shares = sharesByName?.[entry.name];
        const perShare = shares && shares > 0 ? entry.value / shares : undefined;
        return (
          <div key={entry.name} className="mb-1 last:mb-0">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
                <span className="text-muted-foreground">{entry.name}</span>
              </span>
              <span className="font-semibold tabular-nums text-foreground">{fmtCurrency(entry.value)}</span>
            </div>
            {perShare !== undefined && (
              <div className="flex justify-end text-[11px] text-muted-foreground/80 tabular-nums">
                {fmtCurrency(perShare)}/share
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BuyHereChart({
  data,
  ticker,
  stockReturn,
  hasSpy,
  fmtCurrency,
  fmtChartAxis,
  shares,
  spyShares,
}: {
  data: Array<{ date: string; stockValue: number; spyValue?: number }>;
  ticker: string;
  stockReturn: number;
  hasSpy: boolean;
  fmtCurrency: (v: number) => string;
  fmtChartAxis: (v: number) => string;
  shares: number;
  spyShares?: number;
}) {
  // Maps each chart series to its share count so the tooltip can show price/share.
  const sharesByName: Record<string, number> = { [ticker]: shares };
  if (spyShares) sharesByName['S&P 500'] = spyShares;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const tickColor = isDark ? '#a1a1aa' : '#71717a';

  const stockColor = stockReturn >= 0 ? '#22c55e' : '#ef4444';
  const spyColor = '#818cf8';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="w-full"
    >
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stockColor }} />
          <span className="font-medium text-foreground">{ticker}</span>
        </span>
        {hasSpy && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: spyColor }} />
            <span>S&amp;P 500</span>
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={stockColor} stopOpacity={0.18} />
              <stop offset="95%" stopColor={stockColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="spyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={spyColor} stopOpacity={0.12} />
              <stop offset="95%" stopColor={spyColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(v) => {
              const d = new Date(v);
              return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }}
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tickFormatter={(v) => fmtChartAxis(v)}
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<ChartTooltip fmtCurrency={fmtCurrency} sharesByName={sharesByName} />} />
          <Area
            type="monotone"
            dataKey="stockValue"
            name={ticker}
            stroke={stockColor}
            strokeWidth={2}
            fill="url(#stockGrad)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          {hasSpy && (
            <Area
              type="monotone"
              dataKey="spyValue"
              name="S&P 500"
              stroke={spyColor}
              strokeWidth={2}
              fill="url(#spyGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export default function BuyHereClientPage() {
  const { hasAnimatedBackground } = useBackground();
  const { user } = useAuth();
  const { roundNumbers } = useUserSettings();
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [amount, setAmount] = useState('10,000');
  const [timeIndex, setTimeIndex] = useState<number | null>(2);
  const [customDate, setCustomDate] = useState('');
  const [compareSpy, setCompareSpy] = useState(true);
  const [result, setResult] = useState<BuyHereResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const rawCurrency = user?.settings?.default_currency as string | undefined;
  const currency: CurrencyCode = (!rawCurrency || rawCurrency === 'exchange') ? 'USD' : (rawCurrency as CurrencyCode);
  const currencySymbol = getCurrencySymbol(currency);

  const { data: rates } = useExchangeRates(currency);

  // Full formatter for result cards — locale-aware, no abbreviations, honours roundNumbers.
  const fmtCurrency = useMemo(() => {
    const fmt = makeFullFormatter(currency, roundNumbers);
    if (currency === 'USD') return fmt;
    return (usdValue: number) => fmt(convertCurrency(usdValue, 'USD', currency, rates ?? null));
  }, [currency, roundNumbers, rates]);

  // Compact formatter for chart Y-axis tick labels only (space-constrained).
  const fmtChartAxis = useMemo(() => {
    const fmt = makeCompactFormatter(currency);
    if (currency === 'USD') return fmt;
    return (usdValue: number) => fmt(convertCurrency(usdValue, 'USD', currency, rates ?? null));
  }, [currency, rates]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SearchResult;
        if (parsed?.ticker) setSelectedStock(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const persistTicker = useCallback((stock: SearchResult | null) => {
    if (stock) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
      } catch {
        // ignore
      }
    }
  }, []);

  const getFromDate = (): string => {
    if (timeIndex !== null && timeIndex < PRESETS.length) {
      const d = new Date();
      d.setFullYear(d.getFullYear() - PRESETS[timeIndex].years);
      return d.toISOString().slice(0, 10);
    }
    if (customDate) return customDate;
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() - 5);
    return fallback.toISOString().slice(0, 10);
  };

  const handleCalculate = async () => {
    if (!selectedStock) {
      setResult({ success: false, error: 'Select a stock from the search' });
      return;
    }
    const amtInUserCurrency = parseFormattedAmount(amount);
    if (!amtInUserCurrency || amtInUserCurrency <= 0) {
      setResult({ success: false, error: 'Enter a valid investment amount' });
      return;
    }
    // Convert from user's currency to USD (stock prices are quoted in USD)
    const amtUSD = convertCurrency(amtInUserCurrency, currency, 'USD', rates ?? null);

    persistTicker(selectedStock);
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tools/buy-here', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: selectedStock.ticker,
          amount: amtUSD,
          from: getFromDate(),
          compareSpy,
        }),
      });
      const data: BuyHereResult = await res.json();
      setResult(data);
    } catch (e) {
      setResult({
        success: false,
        error: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const amt = parseFormattedAmount(amount);
  const isValid = selectedStock && amt > 0;

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />

      <main className="container mx-auto max-w-4xl py-10 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          All tools
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">If You Bought Here</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                See how an investment would have performed based on historical prices
              </p>
            </div>
          </div>
        </motion.div>

        {/* Inputs - Glass card */}
        <motion.form
          onSubmit={(e) => {
            e.preventDefault();
            handleCalculate();
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mb-8 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-xl p-6 sm:p-8"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
            Inputs
          </p>
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Stock</label>
                <TickerSelector
                  value={selectedStock}
                  onChange={setSelectedStock}
                  placeholder="Search by ticker or company name..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Investment amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                    placeholder="10,000"
                    className={cn(
                      'flex h-11 w-full rounded-lg border border-input bg-background pl-8 pr-4 py-2 text-sm',
                      'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      'transition-all duration-200'
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <label className="text-sm font-medium cursor-help">Time period</label>
                  </TooltipTrigger>
                  <TooltipContent>How far back to simulate the investment</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
              <TimeSelector
                value={timeIndex}
                onChange={setTimeIndex}
                customDate={customDate}
                onCustomDateChange={setCustomDate}
              />
            </div>

            <div className="flex items-center gap-2">
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <span>
                      <CompareToggle checked={compareSpy} onCheckedChange={setCompareSpy} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Compare your stock&apos;s performance with the S&P 500</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            </div>

            <Button
              type="submit"
              disabled={!isValid || isLoading}
              className={cn(
                'w-full h-12 text-base font-semibold',
                'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70',
                'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                'Calculate'
              )}
            </Button>
          </div>
        </motion.form>

        {/* Results */}
        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-xl p-6 sm:p-8"
            >
              <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                </div>
                <Skeleton className="h-64" />
              </div>
            </motion.div>
          )}

          {!isLoading && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-xl p-6 sm:p-8"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
                Results
              </p>

              {!result.success ? (
                <div className="flex items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Failed to load data</p>
                    <p className="text-sm text-muted-foreground mt-1">{result.error}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Please ensure the stock is listed in the US and try again. If the issue persists, check your API key or rate limits.
                    </p>
                  </div>
                </div>
              ) : result.stock ? (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-xl border border-border/50 bg-muted/30 p-5"
                    >
                      <p className="text-sm font-medium text-muted-foreground">
                        {result.stock.ticker} — Your investment
                      </p>
                      <p className="mt-2 text-2xl font-bold text-foreground">
                        <AnimatedCounter value={result.stock.valueNow} format={fmtCurrency} />
                      </p>
                      <p
                        className={cn(
                          'text-sm font-semibold mt-1',
                          result.stock.returnPct >= 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {formatPercent(result.stock.returnPct)} return
                        <span className="font-normal text-muted-foreground">
                          {' '}({formatSignedGain(result.stock.valueNow, result.stock.shares, result.stock.priceAtStart, fmtCurrency)})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.stock.shares.toFixed(2)} shares @ {fmtCurrency(result.stock.priceAtStart)} →{' '}
                        {fmtCurrency(result.stock.priceAtEnd)}
                      </p>
                    </motion.div>
                    {result.spy && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.05 }}
                        className="rounded-xl border border-border/50 bg-muted/30 p-5"
                      >
                        <p className="text-sm font-medium text-muted-foreground">SPY: S&P 500</p>
                        <p className="mt-2 text-2xl font-bold text-foreground">
                          <AnimatedCounter value={result.spy.valueNow} format={fmtCurrency} />
                        </p>
                        <p
                          className={cn(
                            'text-sm font-semibold mt-1',
                            result.spy.returnPct >= 0 ? 'text-green-600' : 'text-red-600'
                          )}
                        >
                          {formatPercent(result.spy.returnPct)} return
                          <span className="font-normal text-muted-foreground">
                            {' '}({formatSignedGain(result.spy.valueNow, result.spy.shares, result.spy.priceAtStart, fmtCurrency)})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Same amount invested in SPY
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {result.chartData && result.chartData.length > 0 && (
                    <BuyHereChart
                      data={result.chartData}
                      ticker={result.stock.ticker}
                      stockReturn={result.stock.returnPct}
                      hasSpy={!!result.spy}
                      fmtCurrency={fmtCurrency}
                      fmtChartAxis={fmtChartAxis}
                      shares={result.stock.shares}
                      spyShares={result.spy?.shares}
                    />
                  )}
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
