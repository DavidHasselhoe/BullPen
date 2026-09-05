'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ThemeCard } from './ThemeCard';
import { THEME_DISPLAY_ORDER } from '@/lib/discover/theme-config';
import type { ThemeCardData } from '@/app/api/discover/themes/route';

/**
 * The "Investing Ideas" theme basket grid — browse a curated theme, then
 * drill into its full constituent list. Sits between the sector performance
 * chart and the algorithmic "Worth a look" collections: a bigger commitment
 * than skimming the market, but lighter than a single-name pick.
 */
export function ThemeGrid() {
  const { t } = useTranslation('discover');

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
  const themes = data?.themes ?? [];

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
