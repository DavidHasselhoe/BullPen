'use client';

import { useTranslation } from 'react-i18next';
import { Compass, Search } from 'lucide-react';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteProvider';
import { useSearchShortcut } from '@/hooks/use-search-shortcut';

export function DiscoverHeader() {
  const { t } = useTranslation('discover');
  const { t: tPalette } = useTranslation('command-palette');
  const { open: openCommandPalette } = useCommandPalette();
  const searchShortcut = useSearchShortcut();
  return (
    <header className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Compass className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('headerTitle')}</h1>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        {t('headerDescription')}
      </p>
      {/* Opens the same palette as the nav search and the shortcut, so a stock lookup behaves the same everywhere. */}
      <button
        type="button"
        onClick={() => openCommandPalette()}
        className="mt-5 flex min-h-11 w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-card px-4 text-left text-sm text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{tPalette('searchPlaceholder')}</span>
        {searchShortcut && (
          <kbd className="hidden shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 font-sans text-[11px] font-medium sm:inline">
            {searchShortcut}
          </kbd>
        )}
      </button>
    </header>
  );
}
