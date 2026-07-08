'use client';

import { useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wallet, Loader2, AlertCircle, TrendingUp, Plus, X } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { AnimatedCounter } from '@/components/tools/buy-here/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import {
  convertCurrency,
  getCurrencySymbol,
  type CurrencyCode,
  type ExchangeRates,
} from '@/lib/currency/currency-conversion';
import { makeFullFormatter, makeCompactFormatter } from '@/lib/currency/format';
import { DIVIDEND_QUICK_PICKS } from '@/lib/finance/dividend-quick-picks';
import { useDividendPresets, type DividendPreset } from '@/hooks/use-dividend-presets';
import { DividendPresetMenu } from '@/components/tools/DividendPresetMenu';

// Chart palette — explicit hex so colors never depend on CSS vars (this app's
// theme tokens are oklch, so hsl(var(--primary)) renders invalid/invisible).
const INCOME_COLOR = '#22c55e';
const PORTFOLIO_COLOR = '#818cf8';

const STORAGE_KEY = 'dividend-portfolio';
const YEAR_PRESETS = [1, 5, 10, 20, 30];
const MAX_HOLDINGS = 15;

/** Tooltip matching the "If you bought here" chart style. */
function ChartTooltip({
  active, payload, label, fmt,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs min-w-[170px]">
      <p className="text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
          </span>
          <span className="font-semibold tabular-nums text-foreground">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
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

/** A single editable portfolio line. */
export interface Holding {
  id: string;
  stock: SearchResult | null;
  mode: 'amount' | 'shares';
  value: string;
}

function formatAmountInput(value: string): string {
  const num = value.replace(/\D/g, '');
  if (!num) return '';
  return parseInt(num, 10).toLocaleString('en-US');
}

function parseFormattedAmount(value: string): number {
  return parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
}

function holdingValueNumber(h: Holding): number {
  return h.mode === 'amount' ? parseFormattedAmount(h.value) : parseFloat(h.value) || 0;
}

function minimalStock(ticker: string, name: string): SearchResult {
  return { ticker: ticker.toUpperCase(), name, cik: '', has_data: false };
}

function loadStoredPortfolio(): Holding[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Array<{ ticker: string; name: string; mode: string; value: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.slice(0, MAX_HOLDINGS).map((p, i) => ({
      id: `saved-${i}`,
      stock: p.ticker ? minimalStock(p.ticker, p.name ?? p.ticker) : null,
      mode: p.mode === 'shares' ? 'shares' : 'amount',
      value: typeof p.value === 'string' ? p.value : '',
    }));
  } catch {
    return null;
  }
}

const EMPTY_ROW: Holding = { id: 'seed', stock: null, mode: 'amount', value: '10,000' };

export default function DividendClientPage() {
  const { hasAnimatedBackground } = useBackground();
  const { user } = useAuth();
  const { roundNumbers } = useUserSettings();

  const userCurrency = useMemo((): CurrencyCode => {
    const settings = user?.settings as Record<string, unknown> | undefined;
    const c = settings?.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user?.settings]);

  const exchangeRates = useExchangeRates(userCurrency);
  const rates = exchangeRates.data ?? null;
  const currencySymbol = getCurrencySymbol(userCurrency);
  const fmtFull = useMemo(() => makeFullFormatter(userCurrency, roundNumbers), [userCurrency, roundNumbers]);
  const fmtCompact = useMemo(() => makeCompactFormatter(userCurrency), [userCurrency]);

  const idRef = useRef(0);
  const makeId = () => `h-${idRef.current++}`;

  const [holdings, setHoldings] = useState<Holding[]>(() =>
    typeof window !== 'undefined' ? loadStoredPortfolio() ?? [EMPTY_ROW] : [EMPTY_ROW]
  );
  const [years, setYears] = useState(10);
  const [drip, setDrip] = useState(true);
  const [result, setResult] = useState<DividendResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickedTickers = useMemo(
    () => new Set(holdings.map((h) => h.stock?.ticker.toUpperCase()).filter(Boolean) as string[]),
    [holdings]
  );

  const { presets, savePreset, deletePreset } = useDividendPresets();

  const applyPreset = (preset: DividendPreset) => {
    setHoldings(preset.holdings.length ? preset.holdings : [EMPTY_ROW]);
  };

  const updateHolding = (id: string, patch: Partial<Holding>) =>
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  const removeHolding = (id: string) =>
    setHoldings((prev) => {
      const next = prev.filter((h) => h.id !== id);
      return next.length ? next : [{ ...EMPTY_ROW, id: makeId() }];
    });

  const addHolding = () =>
    setHoldings((prev) =>
      prev.length >= MAX_HOLDINGS ? prev : [...prev, { id: makeId(), stock: null, mode: 'amount', value: '10,000' }]
    );

  const togglePick = (ticker: string, name: string) => {
    setHoldings((prev) => {
      const idx = prev.findIndex((h) => h.stock?.ticker.toUpperCase() === ticker.toUpperCase());
      if (idx >= 0) {
        const next = prev.filter((_, i) => i !== idx);
        return next.length ? next : [{ ...EMPTY_ROW, id: makeId() }];
      }
      const picked = minimalStock(ticker, name);
      const emptyIdx = prev.findIndex((h) => !h.stock);
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = { ...next[emptyIdx], stock: picked, value: next[emptyIdx].value || '10,000' };
        return next;
      }
      if (prev.length >= MAX_HOLDINGS) return prev;
      return [...prev, { id: makeId(), stock: picked, mode: 'amount', value: '10,000' }];
    });
  };

  const validHoldings = holdings.filter((h) => h.stock && holdingValueNumber(h) > 0);
  const isValid = validHoldings.length > 0;

  const handleCalculate = async () => {
    if (!isValid) {
      setResult({ success: false, error: 'Add at least one stock with a valid amount' });
      return;
    }

    const payload = validHoldings.map((h) => {
      const raw = holdingValueNumber(h);
      // Amounts are entered in the user's currency → convert to USD so the API
      // can divide by the USD price. Shares are currency-agnostic.
      const sharesOrAmount =
        h.mode === 'amount' && userCurrency !== 'USD'
          ? convertCurrency(raw, userCurrency, 'USD', rates)
          : raw;
      return { ticker: h.stock!.ticker, sharesOrAmount, mode: h.mode };
    });

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          validHoldings.map((h) => ({ ticker: h.stock!.ticker, name: h.stock!.name, mode: h.mode, value: h.value }))
        )
      );
    } catch { /* storage unavailable */ }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tools/dividend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload, years, drip }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setIsLoading(false);
    }
  };

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
                Build a dividend portfolio and project income, reinvestment growth, and break-even
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
          {/* Quick pick */}
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Quick add
            </p>
            <div className="flex flex-wrap gap-2">
              {DIVIDEND_QUICK_PICKS.map((pick) => {
                const active = pickedTickers.has(pick.ticker);
                return (
                  <button
                    key={pick.ticker}
                    type="button"
                    onClick={() => togglePick(pick.ticker, pick.name)}
                    aria-pressed={active}
                    title={pick.name}
                    className={cn(
                      'group flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm transition-all duration-150 active:scale-[0.97]',
                      active
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:border-foreground/20 hover:bg-accent/50'
                    )}
                  >
                    <CompanyLogo size={22} ticker={pick.ticker} name={pick.name} logoUrl={null} className="shrink-0" />
                    <span className="font-medium">{pick.ticker}</span>
                    {pick.highYield && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-500">
                        High yield
                      </span>
                    )}
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {active ? '✓' : '+'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Portfolio rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your portfolio
              </p>
              <div className="flex items-center gap-2">
                <DividendPresetMenu
                  presets={presets}
                  onApply={applyPreset}
                  onSave={(name) => savePreset(name, validHoldings)}
                  onDelete={deletePreset}
                />
                <span className="text-xs text-muted-foreground">{pickedTickers.size}/{MAX_HOLDINGS} stocks</span>
              </div>
            </div>

            <div className="space-y-2">
              {holdings.map((h) => (
                <div
                  key={h.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/20 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <TickerSelector
                      value={h.stock}
                      onChange={(r) => updateHolding(h.id, { stock: r })}
                      placeholder="Search stock…"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={h.value}
                      onChange={(e) =>
                        updateHolding(h.id, {
                          value: h.mode === 'amount'
                            ? formatAmountInput(e.target.value)
                            : e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                      placeholder={h.mode === 'amount' ? '10,000' : '100'}
                      className={cn(
                        'h-10 w-28 rounded-lg border border-input bg-background px-3 text-sm tabular-nums',
                        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all'
                      )}
                    />
                    <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
                      {(['amount', 'shares'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateHolding(h.id, { mode: m })}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150',
                            h.mode === m ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                          )}
                          title={m === 'amount' ? `Amount (${userCurrency})` : 'Number of shares'}
                        >
                          {m === 'amount' ? currencySymbol : 'sh'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHolding(h.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Remove stock"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {holdings.length < MAX_HOLDINGS && (
              <button
                type="button"
                onClick={addHolding}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Add stock
              </button>
            )}
          </div>

          <div className="my-6 h-px bg-border/50" />

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
          <div className="mt-6 flex items-center gap-3">
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
                Each stock&apos;s dividends buy more of its own shares, compounding income
              </p>
            </div>
          </div>

          <Button
            type="submit"
            disabled={!isValid || isLoading}
            className={cn(
              'mt-6 w-full h-12 text-base font-semibold',
              'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70',
              'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5'
            )}
          >
            {isLoading ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Calculating…</>
            ) : 'Calculate dividends'}
          </Button>
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
                      Make sure the stocks pay dividends. Rate-limited APIs may need a moment before retrying.
                    </p>
                  </div>
                </div>
              ) : result.years && result.years.length > 0 ? (
                <ResultsView
                  result={result}
                  drip={drip}
                  fmtFull={fmtFull}
                  fmtCompact={fmtCompact}
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
  result, drip, fmtFull, fmtCompact, userCurrency, rates,
}: {
  result: DividendResult;
  drip: boolean;
  fmtFull: (v: number) => string;
  fmtCompact: (v: number) => string;
  userCurrency: CurrencyCode;
  rates: ExchangeRates | null;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const tickColor = isDark ? '#a1a1aa' : '#71717a';
  const {
    holdings, years: yearRows, blendedYield, totalIncomeYear1, totalIncome,
    finalPortfolioValue, totalInvested, breakEvenYear,
  } = result;

  const toDisplay = (usd: number) =>
    userCurrency === 'USD' ? usd : convertCurrency(usd, 'USD', userCurrency, rates);

  const holdingList = holdings ?? [];
  const hasAnyDividends = holdingList.some((h) => !h.noDividends);

  const summaryCards = [
    {
      label: 'Year 1 income',
      value: toDisplay(totalIncomeYear1 ?? 0),
      sub: `${holdingList.length} ${holdingList.length === 1 ? 'stock' : 'stocks'} · ${fmtFull(toDisplay(totalInvested ?? 0))} invested`,
    },
    {
      label: `Total over ${yearRows!.length} years`,
      value: toDisplay(totalIncome ?? 0),
      sub: drip ? 'With dividend reinvestment' : 'Without reinvestment',
    },
    {
      label: 'Final portfolio value',
      value: toDisplay(finalPortfolioValue ?? 0),
      sub: drip ? 'Shares grow via reinvestment' : 'Share count held flat',
    },
    {
      label: 'Blended yield',
      value: blendedYield ?? 0,
      isPercent: true,
      sub: 'Weighted by amount invested',
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
      {!hasAnyDividends && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            None of the selected stocks have dividend history available, so income projects to zero.
            Try adding dividend-paying stocks from Quick add.
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
                <AnimatedCounter value={card.value} format={fmtFull} />
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Per-stock breakdown */}
      {holdingList.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <p className="text-sm font-medium mb-3">By stock</p>
          <div className="overflow-hidden rounded-xl border border-border/50 divide-y divide-border/50">
            {holdingList.map((h) => (
              <div key={h.ticker} className="flex items-center gap-3 px-4 py-3">
                <CompanyLogo size={32} ticker={h.ticker} name={h.ticker} logoUrl={null} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{h.ticker}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.sharesStart.toFixed(2)} shares · {fmtFull(toDisplay(h.invested))} invested
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {fmtFull(toDisplay(h.year1Income))}
                    <span className="text-xs font-normal text-muted-foreground">/yr</span>
                  </p>
                  <p className={cn('text-xs tabular-nums', h.noDividends ? 'text-muted-foreground' : 'text-emerald-500')}>
                    {h.noDividends ? 'No dividend' : `${h.dividendYield.toFixed(2)}% yield`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {breakEvenYear != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4"
        >
          <TrendingUp className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm">
            Cumulative dividends cover your total investment in{' '}
            <strong className="text-foreground">year {breakEvenYear}</strong>.
          </p>
        </motion.div>
      )}

      {hasAnyDividends && breakEvenYear == null && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            At current dividend levels, cumulative income does not cover the total investment within the selected projection window.
          </p>
        </div>
      )}

      {hasAnyDividends && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <p className="text-sm font-medium mb-3">
            Annual dividend income {drip ? '(DRIP — growing each year)' : '(no reinvestment — flat)'}
          </p>
          <div className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height={288}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={INCOME_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={INCOME_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<ChartTooltip fmt={fmtFull} />} />
                <Area dataKey="annualIncome" name="Annual income" type="monotone" stroke={INCOME_COLOR} strokeWidth={2} fill="url(#incomeGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {hasAnyDividends && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-sm font-medium mb-3">Cumulative income over time</p>
          <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: INCOME_COLOR }} />
              <span className="font-medium text-foreground">Cumulative income</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PORTFOLIO_COLOR }} />
              <span>Portfolio value</span>
            </span>
          </div>
          <div className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cumIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={INCOME_COLOR} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={INCOME_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PORTFOLIO_COLOR} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={PORTFOLIO_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<ChartTooltip fmt={fmtFull} />} />
                <Area type="monotone" dataKey="cumulativeIncome" name="Cumulative income" stroke={INCOME_COLOR} strokeWidth={2} fill="url(#cumIncomeGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="portfolioValue" name="Portfolio value" stroke={PORTFOLIO_COLOR} strokeWidth={2} fill="url(#portfolioGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  );
}
