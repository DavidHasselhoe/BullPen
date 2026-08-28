'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { getCountryName } from '@/lib/market/country-flags';
import { cn } from '@/lib/utils';

interface ExchangeRow {
  code: string;
  name: string;
  country: string;
}

interface ExchangesResponse {
  success: boolean;
  exchanges: ExchangeRow[];
}

interface Props {
  /** Codes the user already has in their list — these are excluded from the picker */
  selectedCodes: string[];
  onAdd: (code: string) => void;
}

export function ExchangePicker({ selectedCodes, onAdd }: Props) {
  const { t } = useTranslation('market');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery<ExchangesResponse>({
    queryKey: ['exchanges-list'],
    queryFn: async () => {
      const res = await fetch('/api/exchanges');
      if (!res.ok) throw new Error('Failed to load exchanges');
      return res.json();
    },
    enabled: open, // only fetch when popover opens
    staleTime: 60 * 60 * 1000, // exchanges rarely change
  });

  // Dedupe by country — one row per country, since the card visualizes countries
  // anyway. Excludes already-selected codes (and any other exchange in the same
  // country as a selected one, since they'd render as a duplicate row).
  const selectedSet = new Set(selectedCodes.map((c) => c.toUpperCase()));
  const candidates = useMemo(() => {
    if (!data?.exchanges) return [];
    const selectedCountries = new Set<string>();
    for (const ex of data.exchanges) {
      if (selectedSet.has(ex.code.toUpperCase())) selectedCountries.add(ex.country);
    }
    const seenCountry = new Set<string>();
    const out: ExchangeRow[] = [];
    for (const ex of data.exchanges) {
      if (selectedSet.has(ex.code.toUpperCase())) continue;
      if (selectedCountries.has(ex.country)) continue;
      if (seenCountry.has(ex.country)) continue;
      seenCountry.add(ex.country);
      out.push(ex);
    }
    // Sort by country name for consistent UX
    return out.sort((a, b) =>
      getCountryName(a.country).localeCompare(getCountryName(b.country))
    );
    // selectedSet is derived from the selectedCodes prop; query is read live in filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedCodes.join(',')]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((ex) => {
      const country = getCountryName(ex.country).toLowerCase();
      return (
        country.includes(q) ||
        ex.code.toLowerCase().includes(q) ||
        ex.name.toLowerCase().includes(q)
      );
    });
  }, [candidates, query]);

  function handlePick(code: string) {
    onAdd(code);
    setQuery('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex items-center gap-2 w-full rounded-md border border-dashed',
            'border-border/50 hover:border-foreground/30 px-3 py-2 text-left transition-colors',
            'text-xs text-muted-foreground hover:text-foreground'
          )}
          aria-label={t('exchangePickerAdd')}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="font-medium">{t('exchangePickerAdd')}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-border/50 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/80" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('exchangePickerSearchPlaceholder')}
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('exchangePickerLoading')}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {query ? t('exchangePickerNoMatches') : t('exchangePickerAllAdded')}
            </div>
          ) : (
            filtered.map((ex) => {
              const countryName = getCountryName(ex.country);
              const flagUrl = `https://flagcdn.com/w20/${ex.country.toLowerCase()}.png`;
              return (
                <button
                  key={ex.code}
                  type="button"
                  onClick={() => handlePick(ex.code)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                >
                  <Image
                    src={flagUrl}
                    alt=""
                    width={20}
                    height={15}
                    className="rounded-sm object-cover shrink-0"
                    style={{ width: '20px', height: '15px' }}
                    unoptimized
                  />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">
                    {countryName}
                  </span>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 shrink-0">
                    {ex.code}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
