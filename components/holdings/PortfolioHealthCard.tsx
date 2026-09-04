'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { HealthBloom, HealthBloomLegendRow } from '@/components/finance/HealthBloom';
import { getGlossaryEntry } from '@/lib/finance/glossary';
import { computePortfolioHealth, getCategoryContributors } from '@/lib/finance/portfolio-health';
import type { TickerHealth } from '@/app/api/holdings/health-summary/route';
import type { HoldingWithPrice } from './types';

interface PortfolioHealthCardProps {
  holdings: HoldingWithPrice[];
  isLoading?: boolean;
}

const CATEGORY_ORDER = ['Profitability', 'Financial Strength', 'Valuation', 'Growth', 'Market Risk'];

const GRADE_THRESHOLDS: { grade: string; range: string; labelKey: string }[] = [
  { grade: 'A', range: '85–100', labelKey: 'portfolioHealthGradeStrong' },
  { grade: 'B', range: '70–84', labelKey: 'portfolioHealthGradeGood' },
  { grade: 'C', range: '55–69', labelKey: 'portfolioHealthGradeFair' },
  { grade: 'D', range: '40–54', labelKey: 'portfolioHealthGradeWeak' },
  { grade: 'F', range: '0–39', labelKey: 'portfolioHealthGradeAtRisk' },
];

export function PortfolioHealthCard({ holdings, isLoading }: PortfolioHealthCardProps) {
  const { t } = useTranslation('holdings');
  const symbols = holdings.map((h) => h.symbol);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  const { data, isLoading: healthLoading } = useQuery<{ success: boolean; data: Record<string, TickerHealth> }>({
    queryKey: ['portfolio-health', symbols],
    queryFn: async () => {
      const res = await fetch('/api/holdings/health-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      return res.json();
    },
    enabled: symbols.length > 0,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading || (symbols.length > 0 && healthLoading)) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-5 flex items-center gap-6">
        <Skeleton className="h-[180px] w-[180px] rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </div>
    );
  }

  if (symbols.length === 0) return null;

  const healthMap = new Map(Object.entries(data?.data ?? {}));
  const portfolioHealth = computePortfolioHealth(
    holdings.map((h) => ({ symbol: h.symbol, marketValue: h.marketValue })),
    healthMap
  );

  if (!portfolioHealth) return null;

  const holdingRefs = holdings.map((h) => ({ symbol: h.symbol, marketValue: h.marketValue }));

  const toggleCategory = (name: string) => setOpenCategory((prev) => (prev === name ? null : name));

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('portfolioHealthCardTitle')}
        </span>
        <button
          type="button"
          onClick={() => setExplainOpen((v) => !v)}
          className={cn(
            'transition-colors',
            explainOpen ? 'text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'
          )}
          aria-expanded={explainOpen}
          aria-label={t('portfolioHealthExplainAriaLabel')}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Inline, not a floating popover — this card's bloom+legend content
          fills nearly its full width, leaving no free lateral space for an
          overlay this long to open into without covering the bars it's
          explaining or bleeding into the cards below. Pushing content down
          instead guarantees it can never overlap anything. */}
      {explainOpen && (
        <div className="mb-4 space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3 max-h-80 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-foreground">{t('portfolioHealthExplainHeading')}</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t('portfolioHealthExplainIntro')}</p>
          </div>
          <div className="space-y-2">
            {CATEGORY_ORDER.map((name) => (
              <div key={name} className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {getGlossaryEntry(name)?.description}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border/40 pt-2 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/85">
              {t('portfolioHealthGradeThresholdsHeading')}
            </p>
            {GRADE_THRESHOLDS.map(({ grade, range, labelKey }) => (
              <div key={grade} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-4 font-semibold text-foreground">{grade}</span>
                <span>{range}</span>
                <span className="text-muted-foreground/85">·</span>
                <span>{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-6 flex-wrap">
        <HealthBloom
          score={portfolioHealth.score}
          grade={portfolioHealth.grade}
          categories={portfolioHealth.categories}
          className="text-foreground shrink-0"
          hoveredCategory={hoveredCategory}
          onCategoryHover={setHoveredCategory}
          onCategoryClick={toggleCategory}
        />
        <div className="flex-1 min-w-[180px] space-y-3">
          {/* One shared popover, anchored below the whole row list rather than
              to whichever row was clicked — each row is a full-width trigger,
              so anchoring per-row leaves no room to open beside it in a
              full-width card (it was flipping off-screen). Anchoring below
              the list guarantees it never overlaps any of the 5 rows,
              regardless of which category was opened. */}
          <Popover open={openCategory !== null} onOpenChange={(open) => !open && setOpenCategory(null)}>
            <div className="space-y-1">
              {portfolioHealth.categories.map((cat) => (
                <HealthBloomLegendRow
                  key={cat.name}
                  category={cat}
                  hovered={hoveredCategory === cat.name}
                  onCategoryHover={setHoveredCategory}
                  onClick={() => toggleCategory(cat.name)}
                />
              ))}
            </div>
            <PopoverAnchor asChild>
              <span className="block h-px w-px" aria-hidden="true" />
            </PopoverAnchor>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={16}
              className="w-64 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto space-y-2.5 p-3"
            >
              {openCategory && (() => {
                const cat = portfolioHealth.categories.find((c) => c.name === openCategory);
                if (!cat) return null;
                const contributors = getCategoryContributors(cat.name, holdingRefs, healthMap);
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{cat.name}</span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {cat.score}<span className="text-muted-foreground/80">/{cat.max}</span>
                      </span>
                    </div>
                    {contributors.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('portfolioHealthDrillInEmpty')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {contributors.map((c) => (
                          <div key={c.symbol} className="flex items-center justify-between text-xs">
                            <span className="text-foreground/85">{c.symbol}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {c.score}<span className="text-muted-foreground/70">/{c.max}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
            {t('portfolioHealthCoverage', { covered: portfolioHealth.coveredCount, total: portfolioHealth.totalCount })}
          </p>
        </div>
      </div>
    </div>
  );
}
