'use client';

import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useTopMovers, useMarketNews } from '@/hooks/use-market-data';
import { getExchangesForTickers } from '@/lib/market/ticker-exchange-map';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MarketHoursCard } from './MarketHoursCard';
import { TopMoversCard } from './TopMoversCard';
import { MarketNewsCard } from './MarketNewsCard';
import { Button } from '@/components/ui/button';
import { Briefcase, Globe } from 'lucide-react';
import AnimatedContent from '@/components/ui/AnimatedContent';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const DEFAULT_EXCHANGES = ['NYSE', 'NASDAQ', 'LSE', 'OSE', 'XETRA', 'STO'];

export function MarketContextSection() {
  const { isAuthenticated } = useAuth();
  const { data: holdings } = useHoldings();
  const { marketContextMode, updateMarketContextMode } = useUserSettings();
  const holdingsMode = marketContextMode === 'holdings';

  const tickers = (holdings ?? [])
    .map((h) => h.symbol?.toUpperCase())
    .filter(Boolean) as string[];
  const hasHoldings = tickers.length > 0;
  const canUseHoldingsMode = isAuthenticated && hasHoldings;
  const effectiveHoldingsMode = holdingsMode && canUseHoldingsMode;

  const exchangeCodes = effectiveHoldingsMode
    ? getExchangesForTickers(tickers)
    : DEFAULT_EXCHANGES;
  const moversSymbols = effectiveHoldingsMode ? tickers : null;
  const newsSymbols = effectiveHoldingsMode ? tickers : null;

  const {
    data: topMovers,
    isLoading: isLoadingMovers,
  } = useTopMovers(5, moversSymbols);

  const {
    data: marketNews,
    isLoading: isLoadingNews,
  } = useMarketNews('general', 5, newsSymbols);

  const isEmptyHoldings = effectiveHoldingsMode && tickers.length === 0;

  return (
    <section className="space-y-4 min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider text-foreground">
            Market Context
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {effectiveHoldingsMode
              ? 'Market hours, movers, and news for your portfolio.'
              : 'Market hours, top movers, and recent news.'}
          </p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={effectiveHoldingsMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() =>
                      updateMarketContextMode(holdingsMode ? 'all' : 'holdings')
                    }
                    disabled={!hasHoldings}
                  >
                    {holdingsMode ? (
                      <>
                        <Briefcase className="mr-2 h-4 w-4" />
                        My portfolio
                      </>
                    ) : (
                      <>
                        <Globe className="mr-2 h-4 w-4" />
                        All markets
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {hasHoldings
                    ? holdingsMode
                      ? 'Showing data for your portfolio. Switch to see all markets.'
                      : 'Switch to see only your portfolio: market hours for your exchanges, movers from your holdings, and news about your companies.'
                    : 'Add stocks to your portfolio to personalize Market Context.'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
        <AnimatedContent reverse={true} className="min-w-0">
          <MarketHoursCard
            exchangeCodes={
              effectiveHoldingsMode && exchangeCodes.length > 0
                ? exchangeCodes
                : DEFAULT_EXCHANGES
            }
          />
        </AnimatedContent>
        <AnimatedContent reverse={true} delay={0.05} className="min-w-0">
          {effectiveHoldingsMode && tickers.length === 0 ? (
            <Card className="border-border/50 min-w-0">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">No holdings yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add stocks to see portfolio movers
                </p>
                <Button variant="link" size="sm" className="mt-2" asChild>
                  <a href="/holdings">Go to My Holdings</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <TopMoversCard
              gainers={topMovers?.gainers || []}
              losers={topMovers?.losers || []}
              isLoading={isLoadingMovers}
              isHoldingsMode={!!effectiveHoldingsMode}
            />
          )}
        </AnimatedContent>
        <AnimatedContent reverse={true} delay={0.1} className="min-w-0">
          {effectiveHoldingsMode && tickers.length === 0 ? (
            <Card className="border-border/50 min-w-0">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">No holdings yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add stocks to see portfolio news
                </p>
                <Button variant="link" size="sm" className="mt-2" asChild>
                  <a href="/holdings">Go to My Holdings</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <MarketNewsCard
              news={marketNews || []}
              isLoading={isLoadingNews}
              limit={5}
              isHoldingsMode={!!effectiveHoldingsMode}
            />
          )}
        </AnimatedContent>
      </div>
    </section>
  );
}
