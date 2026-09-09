'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ThemeCard } from './ThemeCard';
import { THEME_DISPLAY_ORDER } from '@/lib/discover/theme-config';
import { useOwnedSymbols } from '@/hooks/use-owned-symbols';
import type { ThemeCardData } from '@/app/api/discover/themes/route';

/**
 * Personalization hook: if the signed-in user owns a ticker that shows up in
 * 2+ baskets, that's a genuine cross-basket signal worth surfacing, not just
 * "you own something in this basket" (true of almost any large-cap holding
 * in a single basket, and not interesting on its own). Iterates
 * THEME_DISPLAY_ORDER's own prominence order (not ownedSymbols' Set iteration
 * order, which reflects insertion/fetch order and isn't meaningful to a
 * user) so the result is deterministic and stable across renders. Only ever
 * surfaces one match -- this is a discovery hook, not a second grid, and
 * DESIGN.md's anti-clutter stance argues against stacking several.
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

/**
 * The "Investing Ideas" theme basket grid — browse a curated theme, then
 * drill into its full constituent list. Sits between the sector performance
 * chart and the algorithmic "Worth a look" collections: a bigger commitment
 * than skimming the market, but lighter than a single-name pick.
 */
export function ThemeGrid() {
  const { t } = useTranslation('discover');
  const ownedSymbols = useOwnedSymbols();

  const { data } = useQuery<{ success: boolean; themes?: ThemeCardData[] }>({
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

  const iconBySlug = new Map(THEME_DISPLAY_ORDER.map((t) => [t.slug, t.icon]));
  const themes = useMemo(() => data?.themes ?? [], [data?.themes]);

  const highlight = useMemo(() => findOwnershipHighlight(ownedSymbols), [ownedSymbols]);
  const personalizedCard: ThemeCardData | null = useMemo(() => {
    if (!highlight) return null;
    const base = themes.find((th) => th.slug === highlight.slug);
    if (!base) return null;
    return { ...base, title: t('ideasThemeBecauseYouOwn', { ticker: highlight.ticker }) };
  }, [highlight, themes, t]);

  if (themes.length === 0) return null;

  return (
    <section aria-labelledby="ideas-themes-heading" className="mb-10">
      <h2
        id="ideas-themes-heading"
        className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        {t('ideasThemesHeading')}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {personalizedCard && (
          <ThemeCard
            key={`owned-${highlight!.ticker}`}
            theme={personalizedCard}
            icon={iconBySlug.get(personalizedCard.slug)!}
            companiesLabel={t('ideasThemeCompaniesCount', { count: personalizedCard.count })}
          />
        )}
        {themes.map((theme) => {
          const icon = iconBySlug.get(theme.slug);
          if (!icon) return null;
          return (
            <ThemeCard
              key={theme.slug}
              theme={theme}
              icon={icon}
              companiesLabel={t('ideasThemeCompaniesCount', { count: theme.count })}
            />
          );
        })}
      </div>
    </section>
  );
}
