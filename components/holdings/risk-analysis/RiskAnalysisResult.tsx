// components/holdings/risk-analysis/RiskAnalysisResult.tsx
'use client';

import type { RiskAnalysis } from './types';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
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
}

// Hierarchy order: score/summary -> risk profile -> top risks -> scenarios ->
// recommendations -> sector exposure -> AI assessment -> history. The
// original redesign brief put history before the AI assessment, but that
// meant scrolling past 8 rows of past scores before reaching the current
// result's actual findings -- the reason anyone opened this in the first
// place. History is still worth keeping (is this score new or old?), just
// after the assessment it's providing context for, not before it.
export function RiskAnalysisResult({ analysis, displayedTimestamp, history, onRestore, onDelete, footer }: Props) {
  return (
    <div className="space-y-7">
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
