'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { glossaryText } from '@/components/ui/GlossaryText';
import { tierBadgeClass } from '@/lib/ui/severity-tiers';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';
import { riskLevelTier, getRoleLabel, ROLE_BADGE_CLASS } from './colors';

const ROLE_ORDER: Record<PortfolioHolding['role'], number> = {
  CORE: 0,
  SECONDARY: 1,
  HEDGE: 2,
};

// Tier-level bar color, not per-ticker — a merged, denser list (this used to
// be two separate sections: tier-grouped bars, and a plain expandable list
// showing the exact same holdings again) benefits more from tier-pattern
// recognition than a rainbow of 12 per-ticker hues that carried no
// information beyond "this row isn't that row."
const ROLE_BAR_COLOR: Record<PortfolioHolding['role'], string> = {
  CORE: '#3b82f6',
  SECONDARY: '#a78bfa',
  HEDGE: '#06b6d4',
};

interface Props {
  holdings: PortfolioHolding[];
  logoMap: Record<string, string | null>;
  isSimplified: boolean;
}

export function AllocationBars({ holdings, logoMap, isSimplified }: Props) {
  const { t } = useTranslation('tools');
  const roleLabel = getRoleLabel(t);
  const rolePlainLabel: Record<PortfolioHolding['role'], string> = {
    CORE: t('portfolioBuilderRolePlainCore'),
    SECONDARY: t('portfolioBuilderRolePlainSecondary'),
    HEDGE: t('portfolioBuilderRolePlainHedge'),
  };
  // One Set shared across every row's rationale/key-risk text — a jargon
  // term already explained in one holding doesn't need a second tooltip in
  // the next one.
  const seen = new Set<string>();

  if (!holdings?.length) return null;

  // Group by role, then sort within each group by allocation desc
  const grouped = holdings
    .slice()
    .sort((a, b) => {
      const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (roleDiff !== 0) return roleDiff;
      return b.allocation_pct - a.allocation_pct;
    });

  const sections: { role: PortfolioHolding['role']; items: PortfolioHolding[] }[] = [];
  for (const h of grouped) {
    const last = sections[sections.length - 1];
    if (last && last.role === h.role) last.items.push(h);
    else sections.push({ role: h.role, items: [h] });
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const sectionTotal = section.items.reduce((sum, h) => sum + h.allocation_pct, 0);
        return (
          <div key={section.role}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
                {roleLabel[section.role]} · {t('portfolioBuilderPositionCount', { count: section.items.length })}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground/80 font-semibold">
                {sectionTotal}%
              </span>
            </div>
            <Accordion type="single" collapsible className="border-t border-border/20">
              {section.items.map((h) => (
                <AccordionItem key={h.ticker} value={h.ticker} className="border-border/20">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-2 text-left">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Link
                          href={slugToAssetPath(h.ticker)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        >
                          <CompanyLogo ticker={h.ticker} name={h.company} logoUrl={logoMap[h.ticker] ?? null} size={24} />
                        </Link>
                        <span className="font-mono text-xs font-bold text-foreground shrink-0">{h.ticker}</span>
                        <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', ROLE_BADGE_CLASS[h.role])}>
                          {isSimplified ? rolePlainLabel[h.role] : roleLabel[h.role]}
                        </span>
                        <span className="text-xs text-muted-foreground/80 truncate">{h.company}</span>
                        <span className="ml-auto shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                          {Math.round(h.allocation_pct)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${h.allocation_pct}%`, backgroundColor: ROLE_BAR_COLOR[h.role] }}
                        />
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pl-[34px]">
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                          {isSimplified ? t('portfolioBuilderWhyThisStock') : t('portfolioBuilderRationale')}
                        </p>
                        <p className="text-[13px] leading-relaxed text-muted-foreground">{glossaryText(h.rationale, seen)}</p>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                            {isSimplified ? t('portfolioBuilderMainRisk') : t('portfolioBuilderKeyRisk')}
                          </p>
                          <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(riskLevelTier(h.risk_level)))}>
                            {h.risk_level}
                          </span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-muted-foreground">{glossaryText(h.key_risk, seen)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <TermTooltip term="Thesis exposure" className="text-[11px] text-muted-foreground/80" />
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground/80">{h.thesis_exposure_score}/10</span>
                      </div>
                      {h.subsector_exposure.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {h.subsector_exposure.map((sub) => (
                            <span key={sub} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground/85">
                              {sub}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        );
      })}
    </div>
  );
}
