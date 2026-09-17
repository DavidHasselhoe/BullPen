'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { Skeleton } from '@/components/ui/skeleton';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { formatCurrency } from '@/lib/currency/currency-conversion';
import { useAddToWatchlist, useIsWatched } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/** Long enough that sweeping the cursor across a paragraph of tickers doesn't
 *  fire four cards, short enough that a deliberate hover feels immediate. */
const OPEN_DELAY_MS = 140;
/** Grace period to travel from the ticker into the card without it vanishing. */
const CLOSE_DELAY_MS = 120;
const MAX_DESCRIPTION_CHARS = 230;

interface PreviewProfile {
  name: string;
  description: string | null;
  sector: string | null;
  logo: string | null;
}

interface PreviewQuote {
  c: number;
  d: number;
  dp: number;
}

/**
 * TwelveData descriptions run several hundred words of filing boilerplate. Two
 * sentences is what a reader mid-paragraph actually wants; the rest is what the
 * company page is for.
 *
 * A sentence ends at punctuation followed by whitespace and a capital letter.
 * Company descriptions are full of periods that end nothing — "Generac Holdings
 * Inc. is a U.S.-based energy technology company" has three, and splitting on
 * any of them produces a sentence that never existed.
 */
export function shorten(text: string): string {
  const ends = [...text.matchAll(/[.!?]\s+(?=[A-Z])/g)];
  const cutAt = ends.length >= 2 && ends[1].index != null ? ends[1].index + 1 : text.length;
  const trimmed = text.slice(0, cutAt).trim();
  if (trimmed.length <= MAX_DESCRIPTION_CHARS) return trimmed;
  const cut = trimmed.slice(0, MAX_DESCRIPTION_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
}

interface Props {
  ticker: string;
  /** Classes for the inline trigger itself, so each surface keeps its own look. */
  className?: string;
  /** Trigger content. Defaults to `$TICKER`. */
  children?: ReactNode;
}

/**
 * A company card on hover, for a ticker mentioned inline in running text.
 *
 * The point is not leaving the page you're reading. A daily brief that names
 * eight companies otherwise asks you to navigate away eight times to find out
 * what any of them are, and a reader who does that has lost the thread of the
 * brief. Logo, name, what the company does and where the price is, then "Open
 * company" for anyone who genuinely wants the full page.
 *
 * Touch gets the same thing on first tap (there is no hover on a phone, and
 * that reader has the most to lose from navigating away); a second tap on the
 * ticker follows the link as usual.
 */
export function TickerPreview({ ticker, className, children }: Props) {
  const { t, i18n } = useTranslation('common');
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  // Latches on first open so reopening the same card is instant, and so a
  // brief full of tickers fetches nothing until one is actually hovered.
  const [everOpened, setEverOpened] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerType = useRef<string>('mouse');

  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancelTimer, [cancelTimer]);

  const openSoon = useCallback(() => {
    cancelTimer();
    timer.current = setTimeout(() => {
      setOpen(true);
      setEverOpened(true);
    }, OPEN_DELAY_MS);
  }, [cancelTimer]);

  const closeSoon = useCallback(() => {
    cancelTimer();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelTimer]);

  const lang = i18n.language ?? 'en';

  // 24h/48h per the profile row of CLAUDE.md's TanStack table — company
  // metadata barely changes, and the route behind this is 10 TwelveData
  // credits on a cache miss, so it must not refetch per mount or per focus.
  const profileQuery = useQuery<PreviewProfile | null>({
    queryKey: ['ticker-preview', ticker, lang],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/company-profile?lang=${lang}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.profile as PreviewProfile) : null;
    },
    enabled: everOpened,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const quoteQuery = useQuery<PreviewQuote | null>({
    queryKey: ['ticker-preview-quote', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/quote`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.quote as PreviewQuote) : null;
    },
    enabled: everOpened,
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const profile = profileQuery.data;
  const quote = quoteQuery.data;
  const name = profile?.name ?? ticker;
  const href = slugToAssetPath(ticker);

  const isWatched = useIsWatched(ticker);
  const addToWatchlist = useAddToWatchlist();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Link
          href={href}
          className={className}
          onPointerDown={(e) => {
            lastPointerType.current = e.pointerType;
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') openSoon();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') closeSoon();
          }}
          onClick={(e) => {
            // Touch/pen: first tap shows the card instead of following the
            // link, since there is no hover to show it with. Radix's trigger
            // composes its own open-toggle behind a defaultPrevented check, so
            // suppressing navigation here also suppresses that — open it
            // explicitly rather than relying on the trigger. A second tap has
            // `open` set and falls through to the link.
            if (lastPointerType.current !== 'mouse' && !open) {
              e.preventDefault();
              setOpen(true);
              setEverOpened(true);
            }
          }}
        >
          {children ?? `$${ticker}`}
        </Link>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        className="w-[300px] p-3.5"
        // Hovering must not move focus: the reader is mid-sentence, and Radix
        // would otherwise scroll the card into view and steal the caret.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={cancelTimer}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') closeSoon();
        }}
      >
        <div className="flex items-start gap-2.5">
          <CompanyLogo ticker={ticker} name={name} logoUrl={profile?.logo ?? null} size={34} />
          <div className="min-w-0 flex-1">
            {profileQuery.isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{name}</p>
            )}
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              ${ticker}
              {profile?.sector ? ` · ${profile.sector}` : ''}
            </p>
          </div>
          {quote && (
            <div className="shrink-0 text-right">
              <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(quote.c, 'USD')}
              </p>
              <p
                className={cn(
                  'mt-0.5 font-mono text-xs font-medium tabular-nums',
                  quote.dp >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {quote.dp >= 0 ? '+' : ''}
                {quote.dp.toFixed(2)}%
              </p>
            </div>
          )}
        </div>

        {profileQuery.isLoading ? (
          <div className="mt-3 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {profile?.description ? shorten(profile.description) : t('tickerPreviewNoProfile')}
          </p>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <Link
            href={href}
            className={cn(
              'flex-1 rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground',
              'transition-colors duration-150 hover:bg-primary/90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            )}
          >
            {t('tickerPreviewOpen')}
          </Link>
          {isAuthenticated && (
            <button
              type="button"
              disabled={isWatched || addToWatchlist.isPending}
              onClick={() => addToWatchlist.mutate({ symbol: ticker, company_name: name })}
              aria-label={isWatched ? t('tickerPreviewWatched') : t('tickerPreviewAdd')}
              title={isWatched ? t('tickerPreviewWatched') : t('tickerPreviewAdd')}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border',
                'text-muted-foreground transition-colors duration-150',
                'hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            >
              {addToWatchlist.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isWatched ? (
                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
