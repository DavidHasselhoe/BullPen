'use client';

import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useTopMoversWithStream, useMarketNews } from '@/hooks/use-market-data';
import { getExchangesForTickers } from '@/lib/market/ticker-exchange-map';
import { Card, CardContent } from '@/components/ui/card';
import { MarketHoursCard } from './MarketHoursCard';
import { ToolsShortcutCard } from './ToolsShortcutCard';
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
import { ALL_SUPPORTED_EXCHANGE_CODES } from '@/lib/market/supported-markets';

// Default when the user hasn't toggled any markets off in Preferences → "Markets
// to display": show every market we support.
const DEFAULT_EXCHANGES = ALL_SUPPORTED_EXCHANGE_CODES;

export function MarketContextSection() {
  const { isAuthenticated } = useAuth();
  const { data: holdings } = useHoldings();
  const {
    marketContextMode,
    updateMarketContextMode,
    marketHoursExchanges,
    updateMarketHoursExchanges,
    toolsShortcuts,
    updateToolsShortcuts,
  } = useUserSettings();
  const holdingsMode = marketContextMode === 'holdings';

  const tickers = (holdings ?? [])
    .map((h) => h.symbol?.toUpperCase())
    .filter(Boolean) as string[];
  const hasHoldings = tickers.length > 0;
  const canUseHoldingsMode = isAuthenticated && hasHoldings;
  const effectiveHoldingsMode = holdingsMode && canUseHoldingsMode;

  // In "all markets" mode, prefer the user's saved exchange list; fall back to defaults.
  // In holdings mode, exchanges are derived from the portfolio's tickers automatically.
  const customExchanges =
    isAuthenticated && marketHoursExchanges !== null && marketHoursExchanges.length > 0
      ? marketHoursExchanges
      : DEFAULT_EXCHANGES;
  const exchangeCodes = effectiveHoldingsMode
    ? getExchangesForTickers(tickers)
    : customExchanges;
  const moversSymbols = effectiveHoldingsMode ? tickers : null;
  const newsSymbols = effectiveHoldingsMode ? tickers : null;

  const {
    data: topMovers,
    isLoading: isLoadingMovers,
  } = useTopMoversWithStream(5, moversSymbols);

  const {
    data: marketNews,
    isLoading: isLoadingNews,
  } = useMarketNews('general', 5, newsSymbols);

  return (
    <section className="space-y-4 min-w-0 overflow-hidden">
      {/* Editorial section header */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">
          Market context
        </span>
        <div className="flex-1 h-px bg-border/50" />
        {isAuthenticated && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateMarketContextMode(holdingsMode ? 'all' : 'holdings')
                  }
                  disabled={!hasHoldings}
                  className="h-6 gap-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-foreground"
                >
                  {holdingsMode ? (
                    <><Briefcase className="h-3 w-3" />My portfolio</>
                  ) : (
                    <><Globe className="h-3 w-3" />All markets</>
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
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
        <AnimatedContent reverse={true} className="min-w-0">
          <div className="space-y-4 min-w-0">
            <MarketHoursCard
              exchangeCodes={
                effectiveHoldingsMode && exchangeCodes.length > 0
                  ? exchangeCodes
                  : customExchanges
              }
              // Editing only makes sense in "all markets" mode — holdings mode
              // derives the list from the portfolio so manual edits would fight
              // that derivation on the next render.
              editable={isAuthenticated && !effectiveHoldingsMode}
              onExchangesChange={(codes) => updateMarketHoursExchanges?.(codes)}
            />
            <ToolsShortcutCard
              toolIds={toolsShortcuts}
              editable={isAuthenticated}
              onToolsChange={(ids) => updateToolsShortcuts?.(ids)}
            />
          </div>
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
