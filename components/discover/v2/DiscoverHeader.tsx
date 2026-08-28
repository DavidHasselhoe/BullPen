'use client';

import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';

export function DiscoverHeader() {
  const { t } = useTranslation('discover');
  return (
    <header className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Compass className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('headerTitle')}</h1>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t('headerDescription')}
      </p>
    </header>
  );
}
