'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Wrench, ArrowRight } from 'lucide-react';
import { TOOLS, type ToolConfig } from '@/lib/tools/tools-config';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useAlerts } from '@/hooks/use-alerts';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ToolPage, ToolHeader } from '@/components/tools/ToolHeader';
import type { SavedDivePreview } from '@/app/api/ai/deep-dive/route';

/**
 * Eleven equal cards made every tool look equally important and gave a
 * newcomer no idea where to start. Three groups by what the person is trying
 * to do, with the AI tools (the product's reason to exist) given the room.
 */
const GROUPS: { id: string; titleKey: string; title: string; blurbKey: string; blurb: string; tools: string[] }[] = [
  {
    id: 'ai',
    titleKey: 'toolsGroupAiTitle',
    title: 'Ask the AI',
    blurbKey: 'toolsGroupAiBlurb',
    blurb: 'Questions answered, stocks researched and portfolios drafted for you.',
    tools: ['ai-chat', 'deep-dive', 'portfolio-builder'],
  },
  {
    id: 'research',
    titleKey: 'toolsGroupResearchTitle',
    title: 'Research the market',
    blurbKey: 'toolsGroupResearchBlurb',
    blurb: 'Find, compare and keep an eye on stocks.',
    tools: ['screener', 'compare', 'calendar', 'heatmap', 'market-mood'],
  },
  {
    id: 'plan',
    titleKey: 'toolsGroupPlanTitle',
    title: 'Plan and track',
    blurbKey: 'toolsGroupPlanBlurb',
    blurb: 'Run the numbers on an idea and get told when it moves.',
    tools: ['buy-here', 'dividend', 'alerts'],
  },
];

const byId = new Map(TOOLS.map((tool) => [tool.id, tool]));

export default function ToolsPage() {
  const { t } = useTranslation('tools');

  return (
    <ToolPage width="wide">
      <ToolHeader
        back={false}
        icon={<Wrench />}
        title={t('toolsPageTitle', 'Investment Tools')}
        description={t('toolsPageSubtitle', 'Calculators, analyzers, and market insights')}
      />

      <div className="space-y-10">
        {GROUPS.map((group) => {
          const tools = group.tools.map((id) => byId.get(id)).filter((x): x is ToolConfig => !!x);
          const featured = group.id === 'ai';
          return (
            <section key={group.id} aria-labelledby={`tools-group-${group.id}`}>
              <div className="mb-3">
                <h2 id={`tools-group-${group.id}`} className="text-base font-semibold text-foreground">
                  {t(group.titleKey, group.title)}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t(group.blurbKey, group.blurb)}</p>
              </div>
              <div className={cn('grid gap-3', featured ? 'md:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3')}>
                {tools.map((tool) => (
                  <ToolLink key={tool.id} tool={tool} featured={featured} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ToolPage>
  );
}

function ToolLink({ tool, featured }: { tool: ToolConfig; featured: boolean }) {
  const Icon = tool.icon;
  const isComingSoon = tool.status === 'coming-soon';
  const { t } = useTranslation('tools');

  return (
    <Link
      href={tool.href}
      aria-disabled={isComingSoon || undefined}
      className={cn(
        'group flex rounded-xl border border-border bg-card transition-colors duration-200 hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        featured ? 'flex-col gap-4 p-5' : 'items-center gap-3 px-4 py-3.5',
        isComingSoon && 'pointer-events-none opacity-70'
      )}
    >
      <div className={cn('flex gap-3', featured ? 'items-start' : 'min-w-0 flex-1 items-center')}>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl transition-colors',
            featured ? 'h-10 w-10 bg-primary/10 text-primary' : 'h-9 w-9 bg-muted text-muted-foreground group-hover:text-foreground'
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{tool.name}</span>
            {isComingSoon && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {t('toolsPageComingSoon', 'Soon')}
              </span>
            )}
          </div>
          <p className={cn('mt-0.5 text-muted-foreground', featured ? 'text-sm leading-relaxed' : 'text-xs leading-snug')}>
            {tool.description}
          </p>
        </div>
        {!featured && (
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
        )}
      </div>
      {tool.id === 'deep-dive' && <LatestDive />}
      {tool.id === 'alerts' && <AlertsState />}
    </Link>
  );
}

/** The newest saved report, so the card shows something of yours, not just a pitch. */
function LatestDive() {
  const { t } = useTranslation('tools');
  const { isAuthenticated } = useAuth();
  const locale = useIntlLocale();
  // Same key and endpoint as the Deep Dive page, so opening it next is a cache hit.
  const { data } = useQuery<{ dives: SavedDivePreview[] }>({
    queryKey: ['deep-dive-list'],
    queryFn: () => fetch('/api/ai/deep-dive').then((r) => r.json()),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });
  const latest = data?.dives?.[0];
  if (!latest) return null;

  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
      <CompanyLogo size={20} ticker={latest.symbol} name={latest.companyName ?? latest.symbol} className="shrink-0" />
      <span>
        {t('toolsLatestDive', 'Latest:')}{' '}
        <span className="font-medium text-foreground">{latest.symbol}</span>
      </span>
      <span aria-hidden>·</span>
      <time dateTime={latest.createdAt} className="tabular-nums">
        {new Date(latest.createdAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
      </time>
    </div>
  );
}

/** Logos of the stocks being watched, beside the arrow on the compact Alerts row. */
function AlertsState() {
  const { t } = useTranslation('tools');
  const { alerts } = useAlerts();
  const symbols = [...new Map(alerts.filter((a) => a.isActive).map((a) => [a.symbol, a])).values()];
  if (symbols.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="sr-only">{t('toolsActiveAlerts', { count: symbols.length })}</span>
      <div className="flex -space-x-1.5" aria-hidden>
        {symbols.slice(0, 3).map((a) => (
          <CompanyLogo key={a.symbol} size={20} ticker={a.symbol} name={a.companyName ?? a.symbol} className="shrink-0 ring-2 ring-card" />
        ))}
      </div>
    </div>
  );
}
