// components/holdings/risk-analysis/RiskAnalysisResult.tsx
'use client';

import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import type { RiskAnalysis } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import { cn } from '@/lib/utils';
import { RiskScoreHero } from './RiskScoreHero';
import { RiskProfile } from './RiskProfile';
import { TopRisks } from './TopRisks';
import { StressScenarios } from './StressScenarios';
import { SectorExposure } from './SectorExposure';
import { Recommendations } from './Recommendations';
import { AnalysisHistory } from './AnalysisHistory';
import { AIAssessment } from './AIAssessment';

interface Props {
  analysis: RiskAnalysis;
  displayedTimestamp: string;
  history: SavedRiskAnalysis[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  footer: React.ReactNode;
  className?: string;
}

// Hierarchy order: score/summary -> risk profile -> top risks -> scenarios ->
// recommendations -> sector exposure -> AI assessment -> history. The
// original redesign brief put history before the AI assessment, but that
// meant scrolling past 8 rows of past scores before reaching the current
// result's actual findings -- the reason anyone opened this in the first
// place. History is still worth keeping (is this score new or old?), just
// after the assessment it's providing context for, not before it.
export function RiskAnalysisResult({ analysis, displayedTimestamp, history, onRestore, onDelete, footer, className }: Props) {
  const { t } = useTranslation('holdings');
  return (
    <div className={cn('space-y-7', className)}>
      {/* Above everything, because every number below it describes a
          portfolio this reader does not own. */}
      {analysis.scenario && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-amber-400">{t('riskScenarioBadge')}</span>{' '}
            {t('riskScenarioNote', {
              count: analysis.scenario.count,
              theme: analysis.scenario.theme,
              share: analysis.scenario.share,
            })}
          </p>
        </div>
      )}

      <RiskScoreHero analysis={analysis} displayedTimestamp={displayedTimestamp} history={history} />

      <div className="space-y-6 border-t border-border/20 pt-6">
        <RiskProfile metrics={analysis.metrics} />
        <TopRisks risks={analysis.topRisks} />
        <StressScenarios scenarios={analysis.stressScenarios} />
        <Recommendations recommendations={analysis.recommendations} />
        <SectorExposure sectors={analysis.sectorBreakdown} />
      </div>

      <div className="space-y-6 border-t border-border/20 pt-6">
        <AIAssessment metrics={analysis.metrics} />
        <AnalysisHistory items={history} onRestore={onRestore} onDelete={onDelete} />
      </div>

      {footer}
    </div>
  );
}
