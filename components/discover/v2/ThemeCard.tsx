'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { HealthRing } from '@/components/finance/HealthRing';
import { cn } from '@/lib/utils';
import type { ThemeCardData } from '@/app/api/discover/themes/route';

interface Props {
  theme: ThemeCardData;
  icon: LucideIcon;
  companiesLabel: string;
}

export function ThemeCard({ theme, icon: Icon, companiesLabel }: Props) {
  const { t } = useTranslation('discover');
  const moreCount = theme.count - theme.logos.length;
  return (
    <Link
      href={`/discover/ideas/${theme.slug}`}
      aria-label={`${theme.title}, ${companiesLabel}`}
      className={cn(
        'group flex h-full w-full min-w-0 flex-col justify-between gap-3',
        'min-h-[140px] rounded-xl border border-border/50 bg-card/50',
        'p-4 transition-all duration-200',
        'hover:border-border hover:bg-card hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20',
        'active:scale-[0.97] active:shadow-none active:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground leading-tight">{theme.title}</h3>
          <p className="mt-1 text-[12px] leading-tight text-muted-foreground/85 line-clamp-2">{theme.tagline}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground/70" aria-hidden />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {theme.logos.map((logo) => (
            <CompanyLogo
              key={logo.ticker}
              name={logo.name}
              ticker={logo.ticker}
              logoUrl={logo.logoUrl}
              size={20}
              className="shrink-0"
            />
          ))}
          {moreCount > 0 && (
            <span className="truncate text-xs text-muted-foreground/70 ml-0.5">
              {t('earningsWidgetMoreCount', { count: moreCount })}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {theme.avgHealth != null && theme.avgHealthGrade != null && (
            // Same mark as the stock detail page's health score, not a bare
            // number -- users already know how to read this ring, where a
            // number alone (was: a colored "70" pill) told them nothing on
            // its own.
            <HealthRing
              score={theme.avgHealth}
              grade={theme.avgHealthGrade}
              size={26}
              className="shrink-0"
            />
          )}
          <span className="text-xs font-medium text-muted-foreground/80 whitespace-nowrap">
            {companiesLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
