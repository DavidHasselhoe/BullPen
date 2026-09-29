'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ExternalLink } from 'lucide-react';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useMarketNews } from '@/hooks/use-market-data';
import { cn } from '@/lib/utils';

const LIMIT = 5;

function ago(unixSeconds: number, t: TFunction): string {
  const mins = Math.floor((Date.now() - unixSeconds * 1000) / 60_000);
  if (mins < 1) return t('newsJustNow');
  if (mins < 60) return t('newsMinsAgo', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('newsHoursAgo', { hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t('newsYesterday') : t('newsDaysAgo', { days });
}

/**
 * Headlines about the stocks this person holds or watches, never the general
 * wire: a home page shouldn't open on geopolitics that touches none of their
 * money. Hidden for accounts with nothing tracked yet.
 */
export function YourNews() {
  const { t } = useTranslation('discover');
  const { t: tMarket } = useTranslation('market');
  // Company news is per listed company; a crypto pair has none to fetch.
  const { symbols } = useHomePortfolio();
  const companySymbols = symbols.filter((s) => !s.includes('/'));
  const { data: news, isLoading, isError } = useMarketNews('general', LIMIT, companySymbols);

  if (companySymbols.length === 0) return null;

  return (
    <HomeSection title={t('homeNewsTitle')}>
      {isLoading ? (
        <div className={cn(homePanel, 'space-y-4 p-5')} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-full animate-shimmer rounded" />
              <div className="h-3 w-1/3 animate-shimmer rounded" />
            </div>
          ))}
        </div>
      ) : isError || !news || news.length === 0 ? (
        <p className={cn(homePanel, 'p-5 text-sm text-muted-foreground')}>
          {isError ? t('homeNewsError') : t('homeNewsEmpty')}
        </p>
      ) : (
        <ul className={cn(homePanel, 'divide-y divide-border/60')}>
          {news.map((a) => {
            // No ticker tag: the feed's `related` is the symbol that was queried,
            // not what the story is about (an Nvidia headline came back as AAPL).
            return (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-foreground">{a.headline}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{a.source || tMarket('newsFallbackSource')}</span>
                      <span aria-hidden>·</span>
                      <span>{ago(a.datetime, tMarket)}</span>
                    </span>
                  </span>
                  <ExternalLink
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden
                  />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </HomeSection>
  );
}
