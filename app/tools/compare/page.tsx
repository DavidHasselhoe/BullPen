'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ArrowLeft, Scale, Building2, BarChart3, TrendingUp, Plus, X, Info, ArrowUpDown, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { CompareCompany } from '@/app/api/compare/route';
import { Suspense, Fragment } from 'react';

interface SearchResult {
  ticker: string;
  name: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
}

const NA = 'Data unavailable';

function fmt(n: number | null): string {
  if (n == null) return NA;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${n.toFixed(2)}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return NA;
  return `${n.toFixed(1)}%`;
}

function formatFiscalYearEnd(fye: string | null): string {
  if (!fye) return NA;
  const [month, day] = fye.split('-');
  if (!month || !day) return fye;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = parseInt(month, 10) - 1;
  return m >= 0 && m < 12 ? `${months[m]} ${parseInt(day, 10)}` : fye;
}

function formatEmployees(n: number | null): string {
  if (n == null) return NA;
  if (n >= 1e6) return `~${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `~${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtEps(n: number | null): string {
  if (n == null) return NA;
  return `$${n.toFixed(2)}`;
}

const MIN_SLOTS = 2;
const MAX_SLOTS = 5;

/** Metric tooltips for less familiar users */
const METRIC_TOOLTIPS: Record<string, string> = {
  grossMargin: 'Gross profit divided by revenue. Measures profitability after direct costs.',
  operatingMargin: 'Operating income divided by revenue. Indicates operational profitability.',
  netMargin: 'Net income divided by revenue. Reflects overall profitability.',
  revenueGrowth: 'Year-over-year revenue change. Indicates top-line growth trend.',
  revenue: 'Total revenue from operations. Primary measure of business scale.',
  netIncome: 'Profit after all expenses and taxes.',
  totalAssets: 'Total value of company assets. Indicates balance sheet size.',
  shareholdersEquity: "Shareholders' ownership value. Assets minus liabilities.",
  freeCashFlow: 'Cash from operations minus capital expenditures. Shows cash generation ability.',
  epsDiluted: 'Earnings per share (diluted). Net income divided by shares outstanding.',
};

/** Metric definitions for expandable details */
const METRIC_DEFINITIONS: Record<string, string> = {
  grossMargin: 'Revenue minus cost of goods sold, divided by revenue.',
  operatingMargin: 'Operating income (revenue minus operating expenses) divided by revenue.',
  netMargin: 'Net income divided by revenue. Reflects bottom-line profitability after all expenses.',
  revenueGrowth: 'Year-over-year percentage change in revenue. Compares latest fiscal year to prior year.',
  revenue: 'Total revenue from operations. Primary measure of business scale and top-line performance.',
  netIncome: 'Profit after all expenses, interest, and taxes.',
  totalAssets: 'Total value of company assets (current and non-current). Indicates balance sheet size.',
  shareholdersEquity: "Shareholders' ownership value. Assets minus liabilities.",
  freeCashFlow: 'Cash from operations minus capital expenditures. Shows cash generation ability.',
  epsDiluted: 'Earnings per share (diluted). Net income divided by weighted average shares outstanding.',
};

/** Why each metric matters for investment analysis */
const METRIC_WHY_IT_MATTERS: Record<string, string> = {
  grossMargin: 'Higher gross margins indicate pricing power or cost efficiency. Sustained low margins can signal commoditization.',
  operatingMargin: 'Indicates operational profitability before interest and taxes. Shows how well management controls costs.',
  netMargin: 'Reflects overall profitability. Higher margins typically indicate a stronger competitive moat.',
  revenueGrowth: 'Sustained growth suggests market share gains or expansion. Compare to industry averages.',
  revenue: 'Scale matters for bargaining power, R&D investment, and economies of scale.',
  netIncome: 'Bottom-line profit drives dividends and buybacks. Essential for valuation.',
  totalAssets: 'Larger asset bases can support growth but also imply greater capital intensity.',
  shareholdersEquity: 'Book value of equity. Important for value investors and financial health.',
  freeCashFlow: 'Cash available for dividends, buybacks, and debt reduction. Key indicator of financial flexibility.',
  epsDiluted: 'Directly comparable across companies. Essential for P/E valuation.',
};

/** Metric groups for scanability. Higher is better for all listed metrics. */
const METRIC_GROUPS = [
  {
    name: 'Profitability',
    metrics: [
      { key: 'grossMargin', label: 'Gross Margin', fmt: fmtPct, isPct: true },
      { key: 'operatingMargin', label: 'Operating Margin', fmt: fmtPct, isPct: true },
      { key: 'netMargin', label: 'Net Margin', fmt: fmtPct, isPct: true },
    ],
  },
  {
    name: 'Growth',
    metrics: [
      { key: 'revenueGrowth', label: 'Revenue Growth YoY', fmt: fmtPct, isPct: true },
    ],
  },
  {
    name: 'Scale',
    metrics: [
      { key: 'revenue', label: 'Revenue', fmt, isPct: false },
      { key: 'netIncome', label: 'Net Income', fmt, isPct: false },
      { key: 'totalAssets', label: 'Total Assets', fmt, isPct: false },
      { key: 'shareholdersEquity', label: "Shareholders' Equity", fmt, isPct: false },
    ],
  },
  {
    name: 'Cash Flow',
    metrics: [
      { key: 'freeCashFlow', label: 'Free Cash Flow', fmt, isPct: false },
      { key: 'epsDiluted', label: 'EPS (Diluted)', fmt: fmtEps, isPct: false },
    ],
  },
] as const;

function computeBetterIndex<V>(values: (V | null)[], higherIsBetter: boolean): number | null {
  const valid = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null && typeof x.v === 'number');
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v));
  return sorted[0].i;
}

function computeDiff(
  a: number | null,
  b: number | null,
  isPct: boolean
): { str: string; isPositive: boolean; absValue: number } | null {
  if (a == null || b == null) return null;
  const diff = a - b;
  const isPositive = diff >= 0;
  const sign = isPositive ? '+' : '';
  let str: string;
  if (isPct) {
    str = `${sign}${diff.toFixed(1)}pp`;
  } else {
    const abs = Math.abs(diff);
    const signChar = isPositive ? '+' : '-';
    if (abs >= 1e12) str = `${signChar}$${(abs / 1e12).toFixed(1)}T`;
    else if (abs >= 1e9) str = `${signChar}$${(abs / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) str = `${signChar}$${(abs / 1e6).toFixed(1)}M`;
    else str = `${signChar}$${diff.toFixed(2)}`;
  }
  return { str, isPositive, absValue: Math.abs(diff) };
}

/** Generate comparison summary bullets (scale, profitability, growth) */
function buildComparisonSummaryBullets(companies: CompareCompany[]): string[] {
  const bullets: string[] = [];
  if (companies.length < 2) return bullets;

  const metricsKey = 'metrics' as const;
  const revA = companies[0]?.metrics?.revenue ?? null;
  const revB = companies[1]?.metrics?.revenue ?? null;
  const gmA = companies[0]?.metrics?.grossMargin ?? null;
  const gmB = companies[1]?.metrics?.grossMargin ?? null;
  const grA = companies[0]?.metrics?.revenueGrowth ?? null;
  const grB = companies[1]?.metrics?.revenueGrowth ?? null;

  if (revA != null && revB != null && revB > 0) {
    const ratio = revA / revB;
    const larger = ratio >= 1 ? companies[0] : companies[1];
    const smaller = ratio >= 1 ? companies[1] : companies[0];
    const r = ratio >= 1 ? ratio : 1 / ratio;
    if (r >= 1.5) {
      const mult = r >= 10 ? Math.round(r) : r >= 2 ? r.toFixed(1) : r.toFixed(1);
      bullets.push(`Scale: ${larger.name} revenue is approximately ${mult}× larger than ${smaller.name}.`);
    }
  }

  if (gmA != null && gmB != null) {
    const diff = gmA - gmB;
    const leader = diff >= 0 ? companies[0] : companies[1];
    const other = diff >= 0 ? companies[1] : companies[0];
    const absDiff = Math.abs(diff);
    if (absDiff >= 5) {
      bullets.push(`Profitability: ${leader.name} gross margin exceeds ${other.name} by over ${Math.round(absDiff)} percentage points.`);
    }
  }

  if (grA != null && grB != null) {
    const higher = grA >= grB ? companies[0] : companies[1];
    const lower = grA >= grB ? companies[1] : companies[0];
    const diff = Math.abs(grA - grB);
    if (diff >= 10) {
      bullets.push(`Growth: ${higher.name} revenue growth significantly exceeds ${lower.name}'s latest annual growth.`);
    }
  }

  return bullets;
}

/** Top metric differences for 2-company comparison, sorted by largest absolute diff */
function buildBiggestDifferences(
  companies: CompareCompany[],
  flattened: Array<{ key: string; label: string; isPct: boolean }>
): Array<{ label: string; str: string; isPositive: boolean }> {
  if (companies.length !== 2) return [];
  const withDiffs = flattened
    .map((m) => {
      const k = m.key as keyof (typeof companies)[0]['metrics'];
      const v0 = companies[0]?.metrics[k] as number | null;
      const v1 = companies[1]?.metrics[k] as number | null;
      const d = computeDiff(v0, v1, m.isPct);
      return d ? { label: m.label, ...d } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.absValue - a.absValue)
    .slice(0, 5);
  return withDiffs.map(({ label, str, isPositive }) => ({ label, str, isPositive }));
}

/** Which company leads each category (by wins per metric in that category) */
function buildCategoryLeaders(companies: CompareCompany[]): Array<{ category: string; leader: string }> {
  return METRIC_GROUPS.map((g) => {
    const wins = new Array(companies.length).fill(0);
    for (const m of g.metrics) {
      const k = m.key as keyof (typeof companies)[0]['metrics'];
      const values = companies.map((c) => c.metrics[k] as number | null);
      const bestIdx = computeBetterIndex(values, true);
      if (bestIdx != null) wins[bestIdx]++;
    }
    const maxWins = Math.max(...wins);
    const leaderIdx = wins.findIndex((w) => w === maxWins);
    return { category: g.name, leader: companies[leaderIdx]?.name ?? '—' };
  });
}

/** Short trend summary from financial history */
function buildTrendSummary(companies: CompareCompany[]): string[] {
  const lines: string[] = [];
  for (const c of companies) {
    const hist = c.history.slice(0, 4).sort((a, b) => b.fiscalYear - a.fiscalYear);
    const revs = hist.map((h) => h.revenue).filter((v): v is number => v != null);
    if (revs.length >= 2) {
      const growth = ((revs[0] - revs[revs.length - 1]) / revs[revs.length - 1]) * 100;
      const trend = growth > 30 ? 'grew dramatically' : growth > 10 ? 'grew steadily' : growth > 0 ? 'grew moderately' : 'declined';
      lines.push(`${c.name} revenue ${trend} between FY${hist[hist.length - 1]?.fiscalYear} and FY${hist[0]?.fiscalYear}.`);
    }
  }
  return lines;
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tickersParam = searchParams.get('tickers');
  const tickersFromUrl = tickersParam
    ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
    : [];
  const tickers = tickersFromUrl;

  const [selectedCompanies, setSelectedCompanies] = useState<SearchResult[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['stock-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      const data = await res.json();
      if (data.success && data.results) return data.results;
      return [];
    },
    enabled: debouncedQuery.trim().length >= 2 && pickerOpen,
    staleTime: 30_000,
  });

  const openPicker = useCallback((slot: number) => {
    setPickerSlot(slot);
    setSearchQuery('');
    setPickerOpen(true);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    setSelectedCompanies((prev) => {
      const next = [...prev];
      next[pickerSlot] = result;
      return next.filter(Boolean);
    });
    setPickerOpen(false);
  }, [pickerSlot]);

  const handleRemove = useCallback((index: number) => {
    setSelectedCompanies((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCompare = useCallback(() => {
    const tickerList = selectedCompanies.map((c) => c.ticker).filter(Boolean);
    if (tickerList.length >= 2) {
      router.push(`/tools/compare?tickers=${tickerList.join(',')}`);
    }
  }, [selectedCompanies, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['compare', tickers.join(',')],
    queryFn: async () => {
      const res = await fetch(`/api/compare?tickers=${tickers.join(',')}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch');
      return json as { success: boolean; companies: CompareCompany[] };
    },
    enabled: tickers.length >= 2,
  });

  if (tickers.length < 2) {
    const slots = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, selectedCompanies.length + 1));
    const canCompare = selectedCompanies.length >= 2;

    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <Link
          href="/tools"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tools
        </Link>
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Scale className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">Compare Companies</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Select 2–5 companies to compare side-by-side. Or ask BullPen AI: &quot;compare NVIDIA and AMD&quot;.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {Array.from({ length: slots }).map((_, i) => (
            <div key={i}>
              {selectedCompanies[i] ? (
                <Card className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <CompanyLogo
                        name={selectedCompanies[i].name}
                        ticker={selectedCompanies[i].ticker}
                        logoUrl={selectedCompanies[i].logo_url}
                        size={32}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{selectedCompanies[i].name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{selectedCompanies[i].ticker}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleRemove(i)}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  variant="outline"
                  className="h-full min-h-[100px] w-full flex flex-col gap-2 border-dashed"
                  onClick={() => openPicker(i)}
                >
                  <Plus className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Add company</span>
                </Button>
              )}
            </div>
          ))}
        </div>
        {canCompare && (
          <div className="mt-6">
            <Button onClick={handleCompare} size="lg">
              Compare {selectedCompanies.length} companies
            </Button>
          </div>
        )}
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Select company</DialogTitle>
              <DialogDescription>
                Search by ticker or company name. Type at least 2 characters.
              </DialogDescription>
            </DialogHeader>
            <Command className="rounded-lg border">
              <CommandInput
                placeholder="Search by ticker or company name..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                {isSearching && (
                  <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
                )}
                {!isSearching && searchResults && searchResults.length > 0 && (() => {
                  const available = searchResults.filter((r) => !selectedCompanies.some((s) => s.ticker === r.ticker));
                  return available.length > 0 ? (
                    <CommandGroup>
                      {available.map((result) => (
                        <CommandItem
                          key={result.ticker}
                          value={`${result.ticker} ${result.name}`}
                          onSelect={() => handleSelect(result)}
                          className="flex items-center gap-3"
                        >
                          <CompanyLogo
                            name={result.name}
                            ticker={result.ticker}
                            logoUrl={result.logo_url ?? null}
                            size={36}
                          />
                          <div className="flex-1 text-left">
                            <div className="font-medium">{result.name}</div>
                            <div className="text-xs text-muted-foreground">{result.ticker}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Selected companies already in comparison.
                    </div>
                  );
                })()}
                {!isSearching && debouncedQuery.trim().length >= 2 && searchResults?.length === 0 && (
                  <CommandEmpty>No companies found.</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (error || (data && !data.success)) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <Link
          href="/tools"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tools
        </Link>
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center">
            <p className="text-destructive">
              {(error as Error)?.message ?? 'Could not load comparison. Check that tickers exist in BullPen.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const companies = data?.companies ?? [];
  const colCount = Math.min(companies.length, 5);

  type MetricSort = 'default' | 'diff' | string;
  const [metricSort, setMetricSort] = useState<MetricSort>('default');
  const [expandedMetricKey, setExpandedMetricKey] = useState<string | null>(null);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);

  const sortOptions: { value: MetricSort; label: string }[] = [
    { value: 'default', label: 'By category' },
    ...(companies.length === 2 ? [{ value: 'diff', label: 'Largest difference first' }] : []),
    ...companies.map((c, i) => ({ value: `company${i}`, label: `By ${c.ticker} value` })),
  ];

  const flattened = METRIC_GROUPS.flatMap((g) => g.metrics.map((m) => ({ ...m, groupName: g.name })));

  const metricsDisplayGroups =
    metricSort === 'default'
      ? METRIC_GROUPS.map((g) => ({ groupName: g.name, metrics: g.metrics }))
      : (() => {
          const withSort = flattened.map((m) => {
            const k = m.key as keyof typeof companies[0]['metrics'];
            const v0 = companies[0]?.metrics[k] as number | null;
            const v1 = companies[1]?.metrics[k] as number | null;
            const sortVal =
              metricSort === 'diff' && v0 != null && v1 != null
                ? Math.abs(v0 - v1)
                : metricSort.startsWith('company')
                  ? (companies[parseInt(metricSort.replace('company', ''), 10)]?.metrics[k] as number | null) ?? -Infinity
                  : 0;
            return { ...m, sortVal };
          });
          withSort.sort((a, b) => (b.sortVal as number) - (a.sortVal as number));
          const sortLabel =
            metricSort === 'diff'
              ? 'Largest differences first'
              : metricSort.startsWith('company')
                ? `By ${companies[parseInt(metricSort.replace('company', ''), 10)]?.ticker ?? ''} value`
                : 'Sorted';
          return [{ groupName: sortLabel, metrics: withSort }];
        })();

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1600px]">
      <Link
        href="/tools"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tools
      </Link>

      {isLoading ? (
        <div className="space-y-8">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
            {Array.from({ length: colCount }).map((_, i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <Scale className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold">
                Comparing {companies.map((c) => c.name).join(' vs ')}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Side-by-side comparison of business profile, key metrics, and financial history from SEC filings.
            </p>

            {/* Comparison Summary — highlights most important differences */}
            {companies.length >= 2 && (() => {
              const summaryBullets = buildComparisonSummaryBullets(companies);
              if (summaryBullets.length === 0) return null;
              return (
                <Card className="mb-6 border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">Comparison Summary</CardTitle>
                    <CardDescription className="text-sm">
                      Key differences at a glance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm">
                      {summaryBullets.map((b, i) => {
                        const colonIdx = b.indexOf(':');
                        const label = colonIdx >= 0 ? b.slice(0, colonIdx) : '';
                        const rest = colonIdx >= 0 ? b.slice(colonIdx + 1).trim() : b;
                        return (
                          <li key={i} className="flex gap-2">
                            <span className="text-primary font-medium shrink-0">{label}:</span>
                            <span className="text-muted-foreground">{rest}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          <div className="space-y-12">
            {/* Company overview cards — mirrored layout with ticker, sector, FY end, key metric */}
            <section>
              <h2 className="flex items-center gap-2 text-xl font-semibold mb-2">
                <Building2 className="h-5 w-5 text-primary" />
                Overview
              </h2>
              <p className="text-sm text-muted-foreground mb-4">Company profiles at a glance</p>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
              >
                {companies.map((c) => (
                  <Link key={c.ticker} href={`/stock/${c.ticker}`}>
                    <Card className="h-full hover:border-primary/50 transition-colors">
                      <CardHeader className="pb-2 space-y-3">
                        <div className="flex items-center gap-3">
                          <CompanyLogo
                            name={c.name}
                            ticker={c.ticker}
                            logoUrl={c.logo_url}
                            size={48}
                          />
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base truncate">{c.name}</CardTitle>
                            <Badge variant="outline" className="font-mono text-xs mt-1">
                              {c.ticker}
                            </Badge>
                          </div>
                        </div>
                        {(c.sector || c.industry) && (
                          <p className="text-xs text-muted-foreground">
                            {[c.sector, c.industry].filter(Boolean).join(' • ')}
                          </p>
                        )}
                        {c.fiscal_year_end && (
                          <p className="text-xs text-muted-foreground">
                            Fiscal year ends {formatFiscalYearEnd(c.fiscal_year_end)}
                          </p>
                        )}
                        <div className="pt-2 border-t border-border/50">
                          <p className="text-xs text-muted-foreground mb-0.5">Revenue (latest)</p>
                          <p className="font-mono text-sm font-medium tabular-nums">
                            {fmt(c.metrics.revenue)}
                          </p>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            {/* Business description — hide section if all lack descriptions */}
            {companies.some((c) => c.description?.trim()) && (
              <section>
                <h2 className="flex items-center gap-2 text-xl font-semibold mb-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Business
                </h2>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
                >
                  {companies.map((c) => (
                    <Card key={c.ticker} className="overflow-hidden">
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
                          {c.description?.trim() || 'Business description not available.'}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Biggest Differences + Category Leaders — above metrics table */}
            {companies.length >= 2 && (() => {
              const biggestDiffs = buildBiggestDifferences(companies, flattened);
              const leaders = buildCategoryLeaders(companies);
              return (
                <div className={`grid gap-4 mb-6 ${biggestDiffs.length > 0 ? 'grid-cols-1 md:grid-cols-2' : ''}`}>
                  {biggestDiffs.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold">Biggest Differences</CardTitle>
                        <p className="text-xs text-muted-foreground">Sorted by largest gap</p>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm font-mono tabular-nums">
                          {biggestDiffs.map((d, i) => (
                            <li key={i} className="flex justify-between items-center">
                              <span className="text-muted-foreground">{d.label}</span>
                              <span className={d.isPositive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                {d.str}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Category Leaders</CardTitle>
                      <p className="text-xs text-muted-foreground">Which company leads each category</p>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {leaders.map(({ category, leader }, i) => (
                          <li key={i} className="flex justify-between items-center gap-4">
                            <span className="text-muted-foreground">{category}</span>
                            <span className="font-medium truncate">{leader}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Key metrics table — grouped, highlighted, sortable, with difference column */}
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-semibold mb-1">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Key Metrics
                  </h2>
                  <p className="text-sm text-muted-foreground">Latest annual comparison</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setAiExplainLoading(true);
                      setAiExplainError(null);
                      setAiExplanation(null);
                      try {
                        const context = JSON.stringify({
                          companies: companies.map((c) => ({
                            ticker: c.ticker,
                            name: c.name,
                            metrics: c.metrics,
                            historySummary: c.history.slice(0, 4).map((h) => ({
                              year: h.fiscalYear,
                              revenue: h.revenue,
                              epsDiluted: h.epsDiluted,
                            })),
                          })),
                        });
                        const res = await fetch('/api/ai/compare-explain', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ context }),
                        });
                        const json = await res.json();
                        if (json.success) setAiExplanation(json.explanation);
                        else setAiExplainError(json.error || 'Failed to generate');
                      } catch (e) {
                        setAiExplainError(e instanceof Error ? e.message : 'Failed to generate');
                      } finally {
                        setAiExplainLoading(false);
                      }
                    }}
                    disabled={aiExplainLoading}
                    className="shrink-0"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {aiExplainLoading ? 'Generating…' : 'Explain Differences'}
                  </Button>
                  <Select value={metricSort} onValueChange={setMetricSort}>
                    <SelectTrigger className="w-[200px]">
                      <ArrowUpDown className="h-4 w-4 mr-2 shrink-0" />
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {aiExplainError && (
                <p className="text-sm text-destructive mb-2">{aiExplainError}</p>
              )}
              {aiExplanation && (
                <Card className="mb-4 border-primary/20 bg-primary/5">
                  <CardContent className="pt-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiExplanation}</p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <div className="overflow-auto max-h-[70vh] overscroll-contain">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-muted/95 dark:bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/90 border-b shadow-sm">
                      <tr>
                        <th className="text-left py-3.5 px-5 font-semibold min-w-[11rem]">Metric</th>
                        {companies.map((c) => (
                          <th key={c.ticker} className="text-right py-3.5 px-5 font-semibold min-w-[7rem] tabular-nums">
                            <Link href={`/stock/${c.ticker}`} className="hover:underline font-mono">
                              {c.ticker}
                            </Link>
                          </th>
                        ))}
                        {companies.length === 2 && (
                          <th className="text-right py-3 px-4 font-medium w-32 text-muted-foreground tabular-nums">
                            Difference
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {metricsDisplayGroups.map((group, groupIndex) => (
                        <Fragment key={`group-${groupIndex}`}>
                          {metricSort === 'default' && (
                            <tr className="bg-muted/30">
                              <td
                                colSpan={companies.length + (companies.length === 2 ? 1 : 0)}
                                className="py-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                              >
                                {group.groupName}
                              </td>
                            </tr>
                          )}
                          {group.metrics.map(({ key, label, fmt: formatter, isPct }) => {
                            const m = key as keyof typeof companies[0]['metrics'];
                            const values = companies.map((c) => c.metrics[m] as number | null);
                            const betterIdx = computeBetterIndex(values, true);
                            const diffRes =
                              companies.length === 2
                                ? computeDiff(values[0], values[1], isPct)
                                : null;
                            const definition = METRIC_DEFINITIONS[key];
                            const whyMatters = METRIC_WHY_IT_MATTERS[key];
                            const expandable = definition || whyMatters;
                            const isExpanded = expandedMetricKey === key;
                            return (
                              <Fragment key={`${groupIndex}-${key}`}>
                                <tr
                                  className={`border-b border-border/50 transition-colors ${
                                    expandable ? 'hover:bg-muted/30 cursor-pointer' : 'hover:bg-muted/20'
                                  }`}
                                  onClick={expandable ? () => setExpandedMetricKey(isExpanded ? null : key) : undefined}
                                >
                                  <td className="py-3 px-4 text-muted-foreground align-middle">
                                    <span className="inline-flex items-center gap-2">
                                      {expandable && (
                                        <span className="text-muted-foreground/60 shrink-0">
                                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </span>
                                      )}
                                      <span>{label}</span>
                                      {!expandable && METRIC_TOOLTIPS[key] && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="inline-flex text-muted-foreground/70 hover:text-muted-foreground focus:outline-none"
                                              aria-label={`Info: ${label}`}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Info className="h-3.5 w-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="right" className="max-w-xs">
                                            {METRIC_TOOLTIPS[key]}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </span>
                                  </td>
                                {companies.map((c, i) => {
                                  const val = c.metrics[m];
                                  const isBetter = betterIdx === i && val != null;
                                  return (
                                    <td
                                      key={c.ticker}
                                      className={`text-right py-3 px-4 font-mono tabular-nums align-middle ${isBetter ? 'border-l-2 border-l-primary/50 bg-primary/5 dark:bg-primary/10' : ''}`}
                                    >
                                      {formatter(val as number | null)}
                                    </td>
                                  );
                                })}
                                {companies.length === 2 && (
                                  <td
                                    className={`text-right py-3 px-4 font-mono tabular-nums align-middle ${
                                      diffRes?.isPositive ? 'text-green-600/90 dark:text-green-400/90' : 'text-muted-foreground'
                                    }`}
                                  >
                                    {diffRes?.str ?? NA}
                                  </td>
                                )}
                              </tr>
                              {isExpanded && expandable && (
                                <tr className="border-b border-border/50 bg-muted/10">
                                  <td colSpan={companies.length + (companies.length === 2 ? 1 : 0)} className="py-3 px-4 pl-12 text-sm">
                                    <div className="space-y-2 text-muted-foreground">
                                      {definition && (
                                        <p>
                                          <span className="font-medium text-foreground/80">Definition:</span>{' '}
                                          {definition}
                                        </p>
                                      )}
                                      {whyMatters && (
                                        <p>
                                          <span className="font-medium text-foreground/80">Why it matters:</span>{' '}
                                          {whyMatters}
                                        </p>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>

            {/* Financial history — unified comparison table */}
            <section>
              <h2 className="flex items-center gap-2 text-xl font-semibold mb-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Financial History
              </h2>
              <p className="text-sm text-muted-foreground mb-4">Annual revenue and EPS by fiscal year</p>
              {(() => {
                const trendLines = buildTrendSummary(companies);
                if (trendLines.length === 0) return null;
                return (
                  <Card className="mb-4 border-muted">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Trend Summary</CardTitle>
                      <p className="text-xs text-muted-foreground">Historical revenue and EPS trends</p>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {trendLines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })()}
              <Card>
                <div className="overflow-auto max-h-[50vh] overscroll-contain">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-muted/95 dark:bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/90 border-b shadow-sm">
                      <tr className="border-b">
                        <th className="text-left py-3.5 px-5 font-semibold w-24">Year</th>
                        {companies.flatMap((c) => [
                          <th key={`${c.ticker}-rev`} className="text-right py-3 px-4 font-medium w-24">
                            <Link href={`/stock/${c.ticker}`} className="hover:underline font-mono text-xs">
                              {c.ticker} Rev
                            </Link>
                          </th>,
                          <th key={`${c.ticker}-eps`} className="text-right py-3.5 px-5 font-semibold min-w-[4rem]">
                            <Link href={`/stock/${c.ticker}`} className="hover:underline font-mono text-xs">
                              {c.ticker} EPS
                            </Link>
                          </th>,
                        ])}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(
                        new Set(companies.flatMap((c) => c.history.map((h) => h.fiscalYear)))
                      )
                        .sort((a, b) => b - a)
                        .slice(0, 6)
                        .map((year) => {
                          const period = `FY${year}`;
                          return (
                            <tr
                              key={year}
                              className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                            >
                              <td className="py-2.5 px-4 font-mono text-muted-foreground">
                                {period}
                              </td>
                              {companies.flatMap((c) => {
                                const h = c.history.find((x) => x.fiscalYear === year);
                                return [
                                  <td
                                    key={`${c.ticker}-rev`}
                                    className={`text-right py-3 px-5 font-mono tabular-nums ${h?.revenue == null ? 'text-muted-foreground' : ''}`}
                                  >
                                    {h?.revenue != null ? fmt(h.revenue) : NA}
                                  </td>,
                                  <td
                                    key={`${c.ticker}-eps`}
                                    className={`text-right py-3 px-5 font-mono tabular-nums ${h?.epsDiluted == null ? 'text-muted-foreground' : ''}`}
                                  >
                                    {h?.epsDiluted != null ? fmtEps(h.epsDiluted) : NA}
                                  </td>,
                                ];
                              })}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
