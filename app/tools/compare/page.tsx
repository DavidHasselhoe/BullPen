'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { Scale, Plus, X } from 'lucide-react';
import type { CompareCompany } from '@/lib/compare/fetch-compare-company';
import { pairSlug } from '@/lib/compare/popular-pairs';
import { RecentlyComparedCard } from '@/components/tools/compare/RecentlyComparedCard';
import { CompareResults } from '@/components/tools/compare/CompareResults';
import { ToolPage, ToolHeader, ToolBackLink, ToolSectionTitle } from '@/components/tools/ToolHeader';
import { ProcessingScreen } from '@/components/ui/ProcessingScreen';

interface SearchResult {
  ticker: string;
  name: string;
  exchange?: string;
  instrument_type?: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
}

const MIN_SLOTS = 2;
const MAX_SLOTS = 5;

/** Friendly copy for known /api/compare error codes. Transient vs. permanent framing matters:
 *  rate_limited means try again shortly, plan_restricted means the data provider (not the
 *  user's BullPen plan) doesn't have this data available. */
function getCompareErrorCopy(t: TFunction): Record<string, { message: string; transient: boolean }> {
  return {
    rate_limited: { message: t('compareErrorRateLimited'), transient: true },
    plan_restricted: { message: t('compareErrorPlanRestricted'), transient: false },
  };
}

function CompareContent() {
  const { t } = useTranslation('tools');
  const compareErrorCopy = getCompareErrorCopy(t);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tickersParam = searchParams.get('tickers');
  const tickers = useMemo(
    () => (tickersParam ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean) : []),
    [tickersParam]
  );

  const [selectedCompanies, setSelectedCompanies] = useState<SearchResult[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // When arriving with tickers in URL (e.g. from Compare quick action), fetch company info and prefill slots.
  // Also runs for the 2+ ticker comparison view: a cheap Supabase-only lookup that gives the
  // loading state real company names while the slower per-company data is still in flight.
  const { data: urlCompaniesData } = useQuery({
    queryKey: ['companies-batch', tickers.join(',')],
    queryFn: async (): Promise<SearchResult[]> => {
      if (tickers.length === 0) return [];
      const res = await fetch('/api/companies/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      const json = await res.json();
      if (!json.success || !json.data) return [];
      return json.data.map((c: { ticker: string; name: string; logo_url?: string | null }) => ({
        ticker: c.ticker,
        name: c.name,
        cik: '',
        has_data: true,
        logo_url: c.logo_url ?? null,
      }));
    },
    enabled: tickers.length >= 1,
    staleTime: 60_000,
  });
  const nameByTicker = useMemo(
    () => new Map((urlCompaniesData ?? []).map((c) => [c.ticker, c.name])),
    [urlCompaniesData]
  );

  const hasInitializedFromUrl = useRef(false);
  useEffect(() => {
    if (urlCompaniesData && urlCompaniesData.length > 0 && tickers.length === 1 && !hasInitializedFromUrl.current) {
      setSelectedCompanies(urlCompaniesData);
      hasInitializedFromUrl.current = true;
    }
  }, [urlCompaniesData, tickers.length]);
  useEffect(() => {
    hasInitializedFromUrl.current = false;
  }, [tickers]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { results: searchResults, isLoading: isSearching } = useInstantSearch(searchQuery, 8);

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

  // One query per company instead of one batched request, so the loading
  // state shows real per-company progress. See ProcessingScreen and /api/compare/company.
  const compareQueries = useQueries({
    queries: tickers.map((ticker) => ({
      queryKey: ['compare-company', ticker],
      queryFn: async (): Promise<CompareCompany | null> => {
        const res = await fetch(`/api/compare/company?ticker=${encodeURIComponent(ticker)}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch');
        return json.company as CompareCompany | null;
      },
      enabled: tickers.length >= 2,
      staleTime: 5 * 60_000,
    })),
  });

  const allSettled = compareQueries.every((q) => !q.isLoading);
  // Hold on the loading screen briefly after everything finishes, showing a
  // distinct "done" state. Entered as a state adjustment during render (not in
  // an effect, which would paint the table for one frame before the hold).
  const [prevAllSettled, setPrevAllSettled] = useState(false);
  const [holding, setHolding] = useState(false);
  if (allSettled !== prevAllSettled) {
    setPrevAllSettled(allSettled);
    if (allSettled && tickers.length >= 2) setHolding(true);
    if (!allSettled) setHolding(false);
  }
  useEffect(() => {
    if (!holding) return;
    const t = setTimeout(() => setHolding(false), 1650);
    return () => clearTimeout(t);
  }, [holding]);
  const isLoading = tickers.length >= 2 && (!allSettled || holding);
  const companies = compareQueries.map((q) => q.data).filter((c): c is CompareCompany => c != null);
  const firstQueryError = compareQueries.find((q) => q.error)?.error as Error | undefined;
  const refetchAll = useCallback(() => {
    compareQueries.forEach((q) => q.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(',')]);
  const progressItems = tickers.map((ticker, i) => ({
    label: compareQueries[i]?.data?.name ?? nameByTicker.get(ticker) ?? ticker,
    done: !compareQueries[i]?.isLoading,
  }));

  if (tickers.length < 2) {
    const slots = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, selectedCompanies.length + 1));
    const canCompare = selectedCompanies.length >= 2;

    return (
      <ToolPage width="wide">
        <ToolHeader icon={<Scale />} title={t('compareTitle')} description={t('compareSubtitle')} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-5">
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
                        {/* clamp-ok: a company name in a narrow slot */}
                        <p className="font-medium text-sm truncate" title={selectedCompanies[i].name}>{selectedCompanies[i].name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{selectedCompanies[i].ticker}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        onClick={() => handleRemove(i)}
                        aria-label={t('compareRemoveButton')}
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
                  <span className="text-sm font-medium">{t('compareAddCompany')}</span>
                </Button>
              )}
            </div>
          ))}
        </div>
        {canCompare && (
          <div className="mt-6">
            <Button onClick={handleCompare} size="lg">
              {t('compareButtonCount', { count: selectedCompanies.length })}
            </Button>
          </div>
        )}
        {/* One-tap starting points: an empty two-slot grid gave a beginner no idea what a useful comparison looks like. */}
        {selectedCompanies.length === 0 && (
          <div className="mt-8">
            <ToolSectionTitle>{t('comparePopularTitle')}</ToolSectionTitle>
            <div className="flex flex-wrap gap-2">
              {POPULAR_COMPARISONS.map((pair) => (
                <Link
                  key={pair.tickers.join(',')}
                  href={`/tools/compare/${pairSlug(pair.tickers[0], pair.tickers[1])}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex -space-x-2">
                    {pair.tickers.map((tk, i) => (
                      <CompanyLogo key={tk} name={pair.names[i]} ticker={tk} logoUrl={null} size={22} className="rounded-full ring-2 ring-background" />
                    ))}
                  </span>
                  {pair.names.join(' vs ')}
                </Link>
              ))}
            </div>
          </div>
        )}
        {/* History after the main action, not above it. */}
        <div className="mt-8">
          <RecentlyComparedCard />
        </div>
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('compareSelectCompanyTitle')}</DialogTitle>
              <DialogDescription>{t('compareSelectCompanyDescription')}</DialogDescription>
            </DialogHeader>
            {/* shouldFilter={false}: results arrive already ranked (useInstantSearch);
                cmdk's own fuzzy re-sort buried NVIDIA under NVIDIA ETFs. */}
            <Command shouldFilter={false} className="rounded-lg border">
              <CommandInput placeholder={t('compareSearchPlaceholder')} value={searchQuery} onValueChange={setSearchQuery} />
              <CommandList>
                {isSearching && (
                  <div className="p-4 text-center text-sm text-muted-foreground">{t('compareSearching')}</div>
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
                          <CompanyLogo name={result.name} ticker={result.ticker} logoUrl={result.logo_url ?? null} size={36} />
                          <div className="flex-1 text-left">
                            <div className="font-medium">{result.name}</div>
                            <div className="text-xs text-muted-foreground">{result.ticker}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">{t('compareAllSelected')}</div>
                  );
                })()}
                {!isSearching && debouncedQuery.trim().length >= 2 && searchResults?.length === 0 && (
                  <CommandEmpty>{t('compareNoCompaniesFound')}</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      </ToolPage>
    );
  }

  if (allSettled && companies.length === 0) {
    const code = firstQueryError?.message;
    const known = code ? compareErrorCopy[code] : undefined;
    const message = known?.message ?? t('compareLoadError');

    return (
      <ToolPage width="wide">
        <ToolBackLink />
        <Card className={known?.transient ? undefined : 'border-destructive/50'}>
          <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
            <p role="alert" className={known?.transient ? 'text-muted-foreground' : 'text-destructive'}>{message}</p>
            <Button variant="outline" size="sm" onClick={refetchAll}>
              {t('tryAgainButton')}
            </Button>
          </CardContent>
        </Card>
      </ToolPage>
    );
  }

  return (
    <ToolPage width="wide">
      <ToolBackLink />
      {isLoading ? (
        <ProcessingScreen
          items={progressItems}
          itemNoun={{ singular: t('compareItemNounSingular'), plural: t('compareItemNounPlural') }}
          complete={allSettled}
          subtext={t('compareProcessingSubtext')}
        />
      ) : (
        <div className="page-enter">
          <CompareResults companies={companies} />
        </div>
      )}
    </ToolPage>
  );
}

/** Well-known head-to-heads for the empty state: same industry, household names, clear contrasts. Each has its own page. */
const POPULAR_COMPARISONS: Array<{ tickers: [string, string]; names: [string, string] }> = [
  { tickers: ['KO', 'PEP'], names: ['Coca-Cola', 'PepsiCo'] },
  { tickers: ['AAPL', 'MSFT'], names: ['Apple', 'Microsoft'] },
  { tickers: ['V', 'MA'], names: ['Visa', 'Mastercard'] },
  { tickers: ['NVDA', 'AMD'], names: ['Nvidia', 'AMD'] },
  { tickers: ['HD', 'LOW'], names: ['Home Depot', "Lowe's"] },
];

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
