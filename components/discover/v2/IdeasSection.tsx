'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ThemeCard } from './ThemeCard';
import { TickerCard } from './TickerCard';
import { THEME_DISPLAY_ORDER } from '@/lib/discover/theme-config';
import { useOwnedSymbols } from '@/hooks/use-owned-symbols';
import { cn } from '@/lib/utils';
import type { ThemeCardData } from '@/app/api/discover/themes/route';
import type { DiscoverFeed, TickerItem } from '@/lib/discover/discover-config';

/** Cards per stock list: one row at desktop width (the grid is lg:grid-cols-6). */
const ROW = 6;
/** Theme cards a phone shows before "Show more": each is a full-width row there. */
const PHONE_THEMES = 4;

type ListKey = 'trending' | 'quality' | 'highs' | 'lows';

/**
 * Personalization hook: if the signed-in user owns a ticker that shows up in
 * 2+ baskets, that's a genuine cross-basket signal worth surfacing, not just
 * "you own something in this basket" (true of almost any large-cap holding
 * in a single basket, and not interesting on its own). Iterates
 * THEME_DISPLAY_ORDER's own prominence order so the result is deterministic.
 * Only ever surfaces one match: this is a discovery hook, not a second grid.
 */
function findOwnershipHighlight(
  ownedSymbols: Set<string>
): { ticker: string; slug: string } | null {
  if (ownedSymbols.size === 0) return null;
  for (const theme of THEME_DISPLAY_ORDER) {
    for (const ticker of theme.tickers) {
      if (!ownedSymbols.has(ticker)) continue;
      const matchCount = THEME_DISPLAY_ORDER.reduce(
        (n, t) => (t.tickers.includes(ticker) ? n + 1 : n),
        0
      );
      if (matchCount >= 2) return { ticker, slug: theme.slug };
    }
  }
  return null;
}

const ICON_BY_SLUG = new Map(THEME_DISPLAY_ORDER.map((t) => [t.slug, t.icon]));

/**
 * Discover's one "find something to research" section. It used to be two
 * back-to-back sections (theme baskets, then four stacked stock lists), about
 * 1,200px on desktop and 2,800px on a phone, doing the same job twice.
 *
 * Themes stay fully in view: a named basket ("AI infrastructure") is the
 * friendliest way in for a beginner. The four stock lists share one chip row
 * and show one at a time, each with its one-sentence reason in plain text
 * under the chips (it was a "?" tooltip a phone user had to discover).
 */
export function IdeasSection({ collections }: { collections: DiscoverFeed['collections'] }) {
  const { t } = useTranslation('discover');
  const ownedSymbols = useOwnedSymbols();
  const [picked, setPicked] = useState<ListKey | null>(null);
  const [allThemes, setAllThemes] = useState(false);
  const themeListRef = useRef<HTMLUListElement>(null);

  const { data, isLoading: themesLoading } = useQuery<{ success: boolean; themes?: ThemeCardData[] }>({
    queryKey: ['discover-themes'],
    queryFn: async () => {
      const res = await fetch('/api/discover/themes');
      if (!res.ok) throw new Error(`Themes failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const themes = useMemo(() => {
    const list = (data?.themes ?? []).filter((th) => ICON_BY_SLUG.has(th.slug));
    const highlight = findOwnershipHighlight(ownedSymbols);
    const owned = highlight && list.find((th) => th.slug === highlight.slug);
    if (!owned) return list;
    // The basket keeps its name; the reason replaces its tagline, and it moves first.
    return [
      { ...owned, tagline: t('ideasThemeBecauseYouOwn', { ticker: highlight.ticker }) },
      ...list.filter((th) => th !== owned),
    ];
  }, [data?.themes, ownedSymbols, t]);

  const lists = useMemo(() => {
    const { trending, qualityDiscount, near52High, near52Low } = collections;
    const personalized = trending.mode === 'personalized';
    // No name a reasoned list already carries: HD sat in "Because of what you
    // follow" and again in "Near 52-week lows", where it at least said why.
    const reasoned = new Set([...qualityDiscount, ...near52High, ...near52Low].map((i) => i.symbol));
    const all: { key: ListKey; label: string; explain: string; items: TickerItem[]; showReason: boolean }[] = [
      {
        key: 'trending',
        label: t(personalized ? 'ideasChipForYou' : 'ideasChipTrending'),
        explain: t(personalized ? 'ideasExplainForYou' : 'ideasExplainTrending'),
        items: trending.items.filter((i) => !reasoned.has(i.symbol)).slice(0, ROW),
        showReason: false,
      },
      { key: 'quality', label: t('ideasChipQuality'), explain: t('ideasExplainQuality'), items: qualityDiscount, showReason: true },
      { key: 'highs', label: t('ideasChipHighs'), explain: t('ideasExplainHighs'), items: near52High, showReason: true },
      { key: 'lows', label: t('ideasChipLows'), explain: t('ideasExplainLows'), items: near52Low, showReason: true },
    ];
    return all.filter((l) => l.items.length > 0);
  }, [collections, t]);

  const active = lists.find((l) => l.key === picked) ?? lists[0];

  if (!themesLoading && themes.length === 0 && !active) return null;

  const hiddenOnPhone = themes.length - PHONE_THEMES;

  return (
    <section aria-labelledby="ideas-heading" className="mb-10">
      <h2 id="ideas-heading" className="mb-4 text-lg font-semibold tracking-tight text-foreground">
        {t('ideasHeading')}
      </h2>

      {themesLoading ? (
        <ThemesPlaceholder />
      ) : (
        themes.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-[13px] font-semibold text-foreground">{t('ideasThemesLabel')}</h3>
            <ul ref={themeListRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {themes.map((theme, i) => (
                <li key={theme.slug} className={cn(i >= PHONE_THEMES && !allThemes && 'hidden sm:block')}>
                  <ThemeCard
                    theme={theme}
                    icon={ICON_BY_SLUG.get(theme.slug)!}
                    companiesLabel={t('ideasThemeCompaniesCount', { count: theme.count })}
                  />
                </li>
              ))}
            </ul>
            {hiddenOnPhone > 0 && !allThemes && (
              <button
                type="button"
                onClick={() => {
                  setAllThemes(true);
                  // The button goes away, so hand keyboard focus to the first theme it revealed.
                  requestAnimationFrame(() => themeListRef.current?.children[PHONE_THEMES]?.querySelector('a')?.focus());
                }}
                className={cn(
                  'mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-border/60 text-sm font-medium text-foreground sm:hidden',
                  'transition-colors duration-150 hover:border-border hover:bg-card',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {t('ideasThemesShowMore', { count: hiddenOnPhone })}
              </button>
            )}
          </div>
        )
      )}

      {active && (
        <div>
          <h3 id="ideas-lists-label" className="mb-3 text-[13px] font-semibold text-foreground">
            {t('ideasListsLabel')}
          </h3>
          <div role="group" aria-labelledby="ideas-lists-label" className="flex flex-wrap gap-2">
            {lists.map((list) => {
              const selected = list.key === active.key;
              return (
                <button
                  key={list.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPicked(list.key)}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-full border px-3.5 text-[13px] font-medium sm:min-h-8',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    selected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {list.label}
                </button>
              );
            })}
          </div>
          {/* Every list sits in the same grid cell and only the chosen one is
              visible, so the block is always as tall as the tallest list and
              switching never shoves the sections below it up or down (reason
              lines make some rows ~30px taller, and an explainer can wrap). */}
          <div className="mt-3 grid">
            {lists.map((list) => (
              // Not `invisible`: visibility is inherited, and TickerCard's
              // transition-all held the outgoing cards on screen for 200ms over
              // the incoming ones. Opacity on the wrapper is instant, and
              // `inert` keeps the hidden lists out of clicks, tab order and
              // screen readers.
              <div
                key={list.key}
                inert={list.key !== active.key}
                className={cn('[grid-area:1/1]', list.key !== active.key && 'opacity-0')}
              >
                <p className="mb-3 text-sm text-muted-foreground">{list.explain}</p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {list.items.map((item) => (
                    <li key={item.symbol}>
                      <TickerCard item={item} showReason={list.showReason} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Reserves the theme grid's height while baskets load: 4 cards and the button on a phone, 9 above. */
function ThemesPlaceholder() {
  return (
    <div aria-hidden className="mb-8">
      <div className="mb-3 h-3.5 w-20 rounded animate-shimmer" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: THEME_DISPLAY_ORDER.length }, (_, i) => (
          <div
            key={i}
            className={cn('h-[140px] rounded-xl border border-border/20 animate-shimmer', i >= PHONE_THEMES && 'hidden sm:block')}
          />
        ))}
      </div>
      <div className="mt-3 h-11 rounded-xl border border-border/20 animate-shimmer sm:hidden" />
    </div>
  );
}

/** The whole section while the Discover feed loads, at the same height as the real thing. */
export function IdeasSkeleton() {
  return (
    <div aria-hidden className="mb-10">
      <div className="mb-4 h-5 w-16 rounded animate-shimmer" />
      <ThemesPlaceholder />
      <div className="mb-3 h-3.5 w-24 rounded animate-shimmer" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 w-24 rounded-full animate-shimmer sm:h-8" />
        ))}
      </div>
      <div className="mb-3 mt-3 h-5 w-80 max-w-full rounded animate-shimmer" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: ROW }, (_, j) => (
          <div key={j} className="h-[131px] rounded-xl border border-border/20 animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
