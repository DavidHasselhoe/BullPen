// components/holdings/risk-analysis/RiskScoreHero.tsx
'use client';

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import type { RiskAnalysis } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import { levelTier, topRiskTier, tierTextClass, splitImpact, drawdownMagnitude } from './colors';

interface Props {
  analysis: RiskAnalysis;
  /** ISO timestamp of the analysis currently on screen — analysis.generatedAt, or the restored-from timestamp. */
  displayedTimestamp: string;
  history: SavedRiskAnalysis[];
}

/** Horizontal risk gauge, modeled on components/stock/VolatilityGauge.tsx's
 * calm->volatile gradient track — an established pattern in this codebase for
 * "where does this number sit on a spectrum," not a new visual language. */
function RiskScale({ score, t }: { score: number; t: TFunction }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="w-full max-w-xs">
      <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground/80">
        <span>{t('riskScaleLow')}</span>
        <span>{t('riskScaleModerate')}</span>
        <span>{t('riskScaleHigh')}</span>
      </div>
    </div>
  );
}

function TrendDelta({ analysis, displayedTimestamp, history, t }: Props & { t: TFunction }) {
  const displayedTime = new Date(displayedTimestamp).getTime();
  const previous = history.find((h) => new Date(h.createdAt).getTime() < displayedTime);
  if (!previous) return null;

  const delta = analysis.overallRiskScore - previous.overallRiskScore;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
        <Minus className="h-3 w-3" /> {t('riskHeroNoChange')}
      </span>
    );
  }
  const worse = delta > 0;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px]', worse ? tierTextClass('risk') : tierTextClass('neutral'))}>
      {worse ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {t('riskHeroPtsVsPrevious', { delta: Math.abs(delta) })}
    </span>
  );
}

function ScoreChangeReason({ reason, t }: { reason: string | null | undefined; t: TFunction }) {
  if (!reason) return null;
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {t('riskHeroScoreChangeReasonTitle')}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{reason}</p>
    </div>
  );
}

function RiskHighlight({ label, title, detail, tier }: { label: string; title: string; detail?: string; tier: 'risk' | 'caution' | 'info' }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-[11px] font-semibold uppercase tracking-wider', tierTextClass(tier))}>{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground truncate">{title}</div>
      {detail && <div className="text-[13px] text-muted-foreground truncate">{detail}</div>}
    </div>
  );
}

export function RiskScoreHero({ analysis, displayedTimestamp, history }: Props) {
  const { t } = useTranslation('holdings');
  const tier = levelTier(analysis.riskLevel);
  const primary = analysis.topRisks?.[0];
  const secondary = analysis.topRisks?.[1];
  const tailScenario = analysis.stressScenarios?.length
    ? [...analysis.stressScenarios].sort((a, b) => drawdownMagnitude(b.estimatedImpact) - drawdownMagnitude(a.estimatedImpact))[0]
    : null;
  const tailFigure = tailScenario ? splitImpact(tailScenario.estimatedImpact).figure : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-4xl font-bold tabular-nums leading-none text-foreground">
              {analysis.overallRiskScore}
              <span className="text-lg text-muted-foreground/60">/100</span>
            </span>
          </div>
          <div className={cn('text-base font-semibold', tierTextClass(tier))}>{t('riskHeroLevelSuffix', { level: analysis.riskLevel })}</div>
          <TrendDelta analysis={analysis} displayedTimestamp={displayedTimestamp} history={history} t={t} />
        </div>
        <RiskScale score={analysis.overallRiskScore} t={t} />
      </div>

      <ScoreChangeReason reason={analysis.scoreChangeReason} t={t} />

      <p className="max-w-prose text-sm leading-relaxed text-foreground/85">{analysis.portfolioSummary}</p>

      {(primary || secondary || tailScenario) && (
        <div className="grid grid-cols-1 gap-4 border-t border-border/20 pt-4 sm:grid-cols-3">
          {primary && (
            <RiskHighlight label={t('riskHeroPrimaryRisk')} title={primary.factor} detail={primary.description} tier={topRiskTier(primary.severity) === 'info' ? 'info' : topRiskTier(primary.severity) === 'caution' ? 'caution' : 'risk'} />
          )}
          {secondary && (
            <RiskHighlight label={t('riskHeroSecondaryRisk')} title={secondary.factor} detail={secondary.description} tier={topRiskTier(secondary.severity) === 'info' ? 'info' : topRiskTier(secondary.severity) === 'caution' ? 'caution' : 'risk'} />
          )}
          {tailScenario && (
            <RiskHighlight label={t('riskHeroTailRisk')} title={tailScenario.scenario} detail={tailFigure ?? undefined} tier="risk" />
          )}
        </div>
      )}
    </div>
  );
}
