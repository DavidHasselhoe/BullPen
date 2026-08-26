'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { tierBadgeClass } from '@/lib/ui/severity-tiers';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';
import { riskLevelTier, getRoleLabel, ROLE_BADGE_CLASS } from './colors';

interface Props {
  holdings: PortfolioHolding[];
  logoMap: Record<string, string | null>;
  isSimplified: boolean;
}

export function HoldingsList({ holdings, logoMap, isSimplified }: Props) {
  const { t } = useTranslation('tools');
  const roleLabel = getRoleLabel(t);
  const rolePlainLabel: Record<PortfolioHolding['role'], string> = {
    CORE: t('portfolioBuilderRolePlainCore'),
    SECONDARY: t('portfolioBuilderRolePlainSecondary'),
    HEDGE: t('portfolioBuilderRolePlainHedge'),
  };
  if (!holdings?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{t('portfolioBuilderHoldingsHeading')}</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {holdings.map((h) => (
          <AccordionItem key={h.ticker} value={h.ticker} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex min-w-0 flex-1 items-center gap-3 pr-2 text-left">
                <Link
                  href={slugToAssetPath(h.ticker)}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                >
                  <CompanyLogo ticker={h.ticker} name={h.company} logoUrl={logoMap[h.ticker] ?? null} size={28} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-foreground">{h.ticker}</span>
                    <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', ROLE_BADGE_CLASS[h.role])}>
                      {isSimplified ? rolePlainLabel[h.role] : roleLabel[h.role]}
                    </span>
                  </div>
                  <div className="truncate text-[13px] text-muted-foreground">{h.company}</div>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {Math.round(h.allocation_pct)}%
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pl-[40px]">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {isSimplified ? t('portfolioBuilderWhyThisStock') : t('portfolioBuilderRationale')}
                  </p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{h.rationale}</p>
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
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{h.key_risk}</p>
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
}
