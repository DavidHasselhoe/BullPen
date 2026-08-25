'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Wrench, ArrowRight } from 'lucide-react';
import { TOOLS } from '@/lib/tools/tools-config';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';

export default function ToolsPage() {
  const { t } = useTranslation('tools');
  const { hasAnimatedBackground } = useBackground();

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-5xl py-10 px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('toolsPageTitle', 'Investment Tools')}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('toolsPageSubtitle', 'Calculators, analyzers, and market insights')}
              </p>
            </div>
          </div>
        </div>

        {/* Tool Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isComingSoon = tool.status === 'coming-soon';

            return (
              <Link
                key={tool.id}
                href={tool.href}
                className={cn(
                  'group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all duration-200',
                  'hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm',
                  isComingSoon && 'opacity-70 pointer-events-none'
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted transition-colors group-hover:bg-primary/10">
                  <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{tool.name}</span>
                    {isComingSoon && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        {t('toolsPageComingSoon', 'Soon')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {tool.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5 transition-all duration-200 group-hover:text-primary group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
