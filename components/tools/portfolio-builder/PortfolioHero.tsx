'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';
import { confidenceTier } from './colors';
import { tierTextClass } from '@/lib/ui/severity-tiers';

interface Props {
  portfolio: Portfolio;
}

/** Same calm→volatile gauge as Risk Analysis's RiskScoreHero, but the scale
 *  reads low→high confidence left to right instead of low→high risk — the
 *  gradient direction flips to match (green where confidence is strong). */
function ConfidenceScale({ score }: { score: number }) {
  const { t } = useTranslation('tools');
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="w-full max-w-xs">
      <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground/80">
        <span>{t('portfolioBuilderScaleLow')}</span>
        <span>{t('portfolioBuilderScaleModerate')}</span>
        <span>{t('portfolioBuilderScaleHigh')}</span>
      </div>
    </div>
  );
}

function Highlight({ label, title, detail }: { label: string; title: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground truncate">{title}</div>
      {detail && <div className="text-[13px] text-muted-foreground truncate">{detail}</div>}
    </div>
  );
}

export function PortfolioHero({ portfolio }: Props) {
  const { t } = useTranslation('tools');
  const tier = confidenceTier(portfolio.confidence_score);
  const topHolding = [...portfolio.holdings].sort((a, b) => b.allocation_pct - a.allocation_pct)[0];
  const primaryRisk = portfolio.key_risks?.[0];
  const bullPoint = portfolio.bull_case?.[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-4xl font-bold tabular-nums leading-none text-foreground">
              {portfolio.confidence_score}
              <span className="text-lg text-muted-foreground/60">/100</span>
            </span>
          </div>
          <div className={cn('text-base font-semibold', tierTextClass(tier))}>
            {t('portfolioBuilderConfidenceSuffix', {
              tier: tier === 'neutral' ? t('portfolioBuilderScaleHigh') : tier === 'caution' ? t('portfolioBuilderScaleModerate') : t('portfolioBuilderScaleLow'),
            })}
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
            {portfolio.investment_horizon}
          </span>
        </div>
        <ConfidenceScale score={portfolio.confidence_score} />
      </div>

      <div>
        <h2 className="text-lg font-semibold leading-tight text-foreground">{portfolio.theme_summary}</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-foreground/85">{portfolio.macro_thesis}</p>
        {portfolio.subsectors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {portfolio.subsectors.map((sub) => (
              <span key={sub} className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-foreground/80">
                {sub}
              </span>
            ))}
          </div>
        )}
      </div>

      {(topHolding || primaryRisk || bullPoint) && (
        <div className="grid grid-cols-1 gap-4 border-t border-border/20 pt-4 sm:grid-cols-3">
          {topHolding && (
            <Highlight label={t('portfolioBuilderTopHolding')} title={`${topHolding.ticker} · ${Math.round(topHolding.allocation_pct)}%`} detail={topHolding.company} />
          )}
          {primaryRisk && (
            <Highlight label={t('portfolioBuilderPrimaryRisk')} title={primaryRisk.title} detail={primaryRisk.description} />
          )}
          {bullPoint && (
            <Highlight label={t('portfolioBuilderBullThesis')} title={bullPoint} />
          )}
        </div>
      )}
    </div>
  );
}
