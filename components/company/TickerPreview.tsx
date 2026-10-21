'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { Skeleton } from '@/components/ui/skeleton';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { formatCurrency } from '@/lib/currency/currency-conversion';
import { useListMembership } from '@/hooks/use-watchlist';
import { useWatchlistLimits } from '@/hooks/use-watchlist-limits';
import { ListRowContent } from '@/components/watchlist/AddToListPicker';
import { CreateListDialog } from '@/components/watchlist/CreateListDialog';
import { PaywallDialog } from '@/components/watchlist/PaywallDialog';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { displayCompanyName } from '@/lib/market-data/company-name';

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

  // Two sentences over the cap: drop to one whole sentence rather than cutting
  // the second one in half. A description that stops mid-clause reads as a bug,
  // and at 230 chars this is the common path, not the rare one. The full text
  // is on the company page, which is what this card links to.
  if (ends.length >= 1 && ends[0].index != null) {
    const firstSentence = text.slice(0, ends[0].index + 1).trim();
    if (firstSentence.length <= MAX_DESCRIPTION_CHARS) return firstSentence;
  }

  // One sentence that is still too long. Cut at a word boundary, the only case
  // left where an ellipsis is the honest option.
  const cut = trimmed.slice(0, MAX_DESCRIPTION_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** A whole card or row as the trigger: a cursor crossing a grid of them must not open each one. */
const CARD_OPEN_DELAY_MS = 450;

interface Props {
  ticker: string;
  /** Classes for the inline trigger itself, so each surface keeps its own look. */
  className?: string;
  /** Trigger content. Defaults to `$TICKER`. */
  children?: ReactNode;
  /**
   * The trigger is a whole card or list row (Discover, the screener), not a
   * ticker in a sentence. It opens on a deliberate hover only, and a tap on a
   * phone follows the link the way a card always has, instead of previewing.
   */
  card?: boolean;
  'aria-label'?: string;
  /** Runs on hover alongside the preview, e.g. to prefetch the stock page. */
  onPointerEnter?: () => void;
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
export function TickerPreview({ ticker, className, children, card = false, 'aria-label': ariaLabel, onPointerEnter }: Props) {
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
    }, card ? CARD_OPEN_DELAY_MS : OPEN_DELAY_MS);
  }, [cancelTimer, card]);

  const closeSoon = useCallback(() => {
    cancelTimer();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelTimer]);

  const href = slugToAssetPath(ticker);
  // The lists open inside the card rather than as a dropdown: a dropdown
  // renders outside the card, and moving the pointer onto it would count as
  // leaving the card and close it. Held here so closing the card collapses them.
  const [listsOpen, setListsOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setListsOpen(false); }}>
      <PopoverTrigger asChild>
        <Link
          href={href}
          className={className}
          aria-label={ariaLabel}
          onPointerDown={(e) => {
            lastPointerType.current = e.pointerType;
          }}
          onPointerEnter={(e) => {
            onPointerEnter?.();
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
            if (!card && lastPointerType.current !== 'mouse' && !open) {
              e.preventDefault();
              setOpen(true);
              setEverOpened(true);
            }
          }}
        >
          {children ?? `$${ticker}`}
        </Link>
      </PopoverTrigger>

      {/* Everything behind the hover (two queries, the watchlist hooks, two
          dialogs) mounts on first open. Rendered for every card, it was the
          biggest part of Discover's hydration on a phone (2026-10-21). */}
      {everOpened && (
        <PreviewCard
          ticker={ticker}
          listsOpen={listsOpen}
          setListsOpen={setListsOpen}
          cancelTimer={cancelTimer}
          closeSoon={closeSoon}
        />
      )}
    </Popover>
  );
}

interface PreviewCardProps {
  ticker: string;
  listsOpen: boolean;
  setListsOpen: Dispatch<SetStateAction<boolean>>;
  cancelTimer: () => void;
  closeSoon: () => void;
}

function PreviewCard({ ticker, listsOpen, setListsOpen, cancelTimer, closeSoon }: PreviewCardProps) {
  const { t, i18n } = useTranslation('common');
  const { t: tw } = useTranslation('watchlist');
  const { isAuthenticated } = useAuth();
  const href = slugToAssetPath(ticker);

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
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const profile = profileQuery.data;
  const quote = quoteQuery.data;
  // "Microsoft", not "Microsoft Corporation Common Stock"; the full name is on hover.
  const name = displayCompanyName(profile?.name ?? ticker, ticker);

  const membership = useListMembership(ticker, name);
  const { lists, inLists, isWatched } = membership;
  const { canCreateList } = useWatchlistLimits();
  const [createOpen, setCreateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const hasLists = (lists?.length ?? 0) > 0;

  return (
    <>
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
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={profile?.name}>{name}</p>
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
              disabled={lists === undefined || (!hasLists && membership.isPending)}
              // No lists yet: one click adds, and the API creates the first list.
              onClick={() => (hasLists ? setListsOpen((o) => !o) : membership.addTo())}
              aria-expanded={hasLists ? listsOpen : undefined}
              aria-label={isWatched ? t('tickerPreviewWatched') : t('tickerPreviewAdd')}
              title={isWatched ? t('tickerPreviewWatched') : t('tickerPreviewAdd')}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                'transition-colors duration-150 disabled:cursor-default',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isWatched || listsOpen
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {!hasLists && membership.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isWatched ? (
                <BookmarkCheck className="h-3.5 w-3.5" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>

        {listsOpen && hasLists && (
          <div className="mt-3 border-t border-border pt-2.5">
            <p className="mb-1 px-1 text-xs text-muted-foreground">
              {isWatched ? tw('watchlistPickerInHeading', { ticker }) : tw('watchlistPickerAddHeading', { ticker })}
            </p>
            {lists!.map((list) => {
              const selected = inLists.has(list.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => membership.toggle(list.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ListRowContent list={list} selected={selected} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => (canCreateList ? setCreateOpen(true) : setPaywallOpen(true))}
              className="mt-0.5 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {tw('watchlistPickerNewList')}
            </button>
          </div>
        )}
      </PopoverContent>

    {/* Outside the card so they survive it closing when focus moves into the dialog. */}
    <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => membership.addTo(id)} />
    <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}
