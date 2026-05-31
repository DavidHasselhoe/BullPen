'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wallet, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { AnimatedCounter } from '@/components/tools/buy-here/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import {
  convertCurrency,
  getCurrencySymbol,
  type CurrencyCode,
  type ExchangeRates,
} from '@/lib/currency/currency-conversion';

const STORAGE_KEY = 'dividend-last-ticker';
const YEAR_PRESETS = [1, 5, 10, 20, 30];

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

function makeFormatCurrency(symbol: string) {
  return function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
    return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
}

function formatAmountInput(value: string): string {
  const num = value.replace(/\D/g, '');
  if (!num) return '';
  // Always use en-US locale (commas) so parseFormattedAmount can reliably strip them
  return parseInt(num, 10).toLocaleString('en-US');
}

function parseFormattedAmount(value: string): number {
  // Strip all non-numeric characters (handles commas, spaces, and other locale separators)
  return parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
}

function loadStoredTicker(): SearchResult | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as SearchResult;
    return parsed?.ticker ? parsed : null;
  } catch {
    return null;
  }
}

export default function DividendClientPage() {
  const { hasAnimatedBackground } = useBackground();
  const { user } = useAuth();

  const userCurrency = useMemo((): CurrencyCode => {
    const settings = user?.settings as Record<string, unknown> | undefined;
    const c = settings?.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user?.settings]);

  const exchangeRates = useExchangeRates(userCurrency);
  const rates = exchangeRates.data ?? null;
  const currencySymbol = getCurrencySymbol(userCurrency);
  const formatCurrency = makeFormatCurrency(currencySymbol);

  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(() =>
    typeof window !== 'undefined' ? loadStoredTicker() : null
  );
  const [mode, setMode] = useState<'shares' | 'amount'>('amount');
  const [amountInput, setAmountInput] = useState('10,000');
  const [sharesInput, setSharesInput] = useState('100');
  const [years, setYears] = useState(10);
  const [drip, setDrip] = useState(true);
  const [result, setResult] = useState<DividendResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCalculate = async () => {
    if (!selectedStock) {
      setResult({ success: false, error: 'Select a stock from the search' });
      return;
    }
    const rawAmount = mode === 'amount' ? parseFormattedAmount(amountInput) : parseFloat(sharesInput) || 0;

    if (!rawAmount || rawAmount <= 0) {
      setResult({ success: false, error: `Enter a valid ${mode === 'amount' ? 'investment amount' : 'number of shares'}` });
      return;
    }

    // Convert investment amount from user's currency to USD so the API can
    // divide by the USD stock price to get the correct share count.
    // Shares mode is currency-agnostic — no conversion needed.
    const sharesOrAmount =
      mode === 'amount' && userCurrency !== 'USD'
        ? convertCurrency(rawAmount, userCurrency, 'USD', rates)
        : rawAmount;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedStock));
    } catch { /* storage unavailable */ }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tools/dividend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selectedStock.ticker, sharesOrAmount, mode, years, drip }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const isValid =
    selectedStock &&
    (mode === 'amount' ? parseFormattedAmount(amountInput) > 0 : parseFloat(sharesInput) > 0);

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
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
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Dividend Calculator</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Project annual income, reinvestment growth, and break-even year for dividend stocks
              </p>
            </div>
          </div>
        </motion.div>

        {/* Inputs */}
        <motion.form
          onSubmit={(e) => { e.preventDefault(); handleCalculate(); }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mb-8 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-xl p-6 sm:p-8"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
            Inputs
          </p>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Stock</label>
              <TickerSelector
                value={selectedStock}
                onChange={setSelectedStock}
                placeholder="Search by ticker or company name..."
              />
            </div>

            {/* Mode toggle */}
            <div className="space-y-3">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
                {(['amount', 'shares'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
                      mode === m
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {m === 'amount' ? 'Investment amount' : 'Number of shares'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {mode === 'amount' ? (
                  <motion.div
                    key="amount"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ duration: 0.15 }}
                    className="relative max-w-xs"
                  >
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{currencySymbol}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amountInput}
                      onChange={(e) => setAmountInput(formatAmountInput(e.target.value))}
                      placeholder="10,000"
                      className={cn(
                        'flex h-11 w-full rounded-lg border border-input bg-background pl-8 pr-4 py-2 text-sm',
                        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200'
                      )}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="shares"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.15 }}
                    className="relative max-w-xs"
                  >
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={sharesInput}
                      onChange={(e) => setSharesInput(e.target.value)}
                      placeholder="100"
                      className={cn(
                        'flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm',
                        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200'
                      )}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                      shares
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Year presets */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Projection period</label>
              <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted/50 border border-border/50 w-fit">
                {YEAR_PRESETS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYears(y)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      years === y
                        ? 'bg-background text-foreground shadow-sm border border-border/50'
                        : 'border border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {y} {y === 1 ? 'year' : 'years'}
                  </button>
                ))}
              </div>
            </div>

            {/* DRIP toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={drip}
                onClick={() => setDrip((d) => !d)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  drip ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200',
                    drip ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
              <div>
                <p className="text-sm font-medium">Reinvest dividends (DRIP)</p>
                <p className="text-xs text-muted-foreground">
                  Dividends buy more shares each year, compounding your income
                </p>
              </div>
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
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Calculating...</>
              ) : 'Calculate'}
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
              className="rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-xl p-6 sm:p-8 space-y-6"
            >
              <Skeleton className="h-8 w-48" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
              <Skeleton className="h-72" />
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
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">Results</p>

              {!result.success ? (
                <div className="flex items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Could not calculate dividends</p>
                    <p className="text-sm text-muted-foreground mt-1">{result.error}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Make sure the stock pays dividends. Rate-limited APIs may need a moment before retrying.
                    </p>
                  </div>
                </div>
              ) : result.years && result.years.length > 0 ? (
                <ResultsView
                  result={result}
                  mode={mode}
                  drip={drip}
                  formatCurrency={formatCurrency}
                  userCurrency={userCurrency}
                  rates={rates}
                />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ResultsView({
  result, mode, drip, formatCurrency, userCurrency, rates,
}: {
  result: DividendResult;
  mode: 'shares' | 'amount';
  drip: boolean;
  formatCurrency: (v: number) => string;
  userCurrency: CurrencyCode;
  rates: ExchangeRates | null;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const tickColor = isDark ? '#a1a1aa' : '#71717a';
  const {
    ticker, sharesStart, currentPrice, annualDividendPerShare,
    dividendYield, currency, years: yearRows, breakEvenYear, totalIncome, finalPortfolioValue,
  } = result;

  // Convert USD API values to user's display currency
  const toDisplay = (usd: number) =>
    userCurrency === 'USD' ? usd : convertCurrency(usd, 'USD', userCurrency, rates);

  const yr1 = yearRows![0];
  const noDividends = (annualDividendPerShare ?? 0) === 0;

  const summaryCards = [
    {
      label: 'Year 1 income',
      value: toDisplay(yr1.annualIncome),
      sub: `${currency ?? 'USD'} · ${annualDividendPerShare?.toFixed(4) ?? '—'}/share/yr`,
    },
    {
      label: `Total over ${yearRows!.length} years`,
      value: toDisplay(totalIncome ?? 0),
      sub: drip ? 'With dividend reinvestment' : 'Without reinvestment',
    },
    {
      label: 'Final portfolio value',
      value: toDisplay(finalPortfolioValue ?? 0),
      sub: `${yearRows![yearRows!.length - 1].shares.toFixed(2)} shares @ ${formatCurrency(toDisplay(currentPrice ?? 0))}`,
    },
    {
      label: 'Dividend yield',
      value: dividendYield ?? 0,
      isPercent: true,
      sub: `${ticker} · ${sharesStart?.toFixed(2) ?? '—'} shares to start`,
    },
  ];

  const chartData = yearRows!.map((row) => ({
    year: `Y${row.year}`,
    annualIncome: parseFloat(toDisplay(row.annualIncome).toFixed(2)),
    cumulativeIncome: parseFloat(toDisplay(row.cumulativeIncome).toFixed(2)),
    portfolioValue: parseFloat(toDisplay(row.portfolioValue).toFixed(2)),
  }));

  return (
    <div className="space-y-8">
      {noDividends && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            No dividend history found for <strong>{ticker}</strong>. This stock may not pay dividends, or data is unavailable.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-border/50 bg-muted/30 p-4"
          >
            <p className="text-xs font-medium text-muted-foreground mb-1">{card.label}</p>
            <p className="text-xl font-bold text-foreground">
              {card.isPercent ? (
                <AnimatedCounter value={card.value} format={(n) => `${n.toFixed(2)}%`} />
              ) : (
                <AnimatedCounter value={card.value} format={formatCurrency} />
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      {mode === 'amount' && breakEvenYear != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4"
        >
          <TrendingUp className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm">
            Cumulative dividends cover your initial investment in{' '}
            <strong className="text-foreground">year {breakEvenYear}</strong>.
          </p>
        </motion.div>
      )}

      {mode === 'amount' && !noDividends && breakEvenYear == null && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            At current dividend levels, cumulative income does not cover the initial investment within the selected projection window.
          </p>
        </div>
      )}

      {!noDividends && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <p className="text-sm font-medium mb-3">
            Annual dividend income {drip ? '(DRIP — growing each year)' : '(no reinvestment — flat)'}
          </p>
          <div className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height={288}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={72} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [formatCurrency(value), 'Annual income']}
                />
                <Area dataKey="annualIncome" name="Annual income" type="monotone" stroke="#22c55e" strokeWidth={2} fill="url(#incomeGradient)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {!noDividends && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-sm font-medium mb-3">Cumulative income over time</p>
          <div className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={72} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [formatCurrency(value)]}
                />
                <Legend />
                <Line type="monotone" dataKey="cumulativeIncome" name="Cumulative income" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="portfolioValue" name="Portfolio value" stroke="hsl(var(--chart-2, 160 60% 45%))" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  );
}
