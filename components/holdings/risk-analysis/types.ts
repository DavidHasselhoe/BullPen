// components/holdings/risk-analysis/types.ts
// Moved out of PortfolioRiskAnalysis.tsx unchanged — same shape the AI's JSON
// schema returns (app/api/holdings/risk-analysis/route.ts:36-58).

export interface RiskMetric {
  score: number;
  label: string;
  detail: string;
}

export interface StressScenario {
  scenario: string;
  estimatedImpact: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RiskAnalysis {
  overallRiskScore: number;
  riskLevel: string;
  generatedAt: string;
  metrics: {
    concentration: RiskMetric;
    sectorDiversification: RiskMetric;
    marketCapBias: RiskMetric;
    volatilityExposure: RiskMetric;
    correlationRisk: RiskMetric;
    liquidityRisk: RiskMetric;
  };
  topRisks: { severity: string; factor: string; description: string }[];
  sectorBreakdown: { sector: string; symbols: string[]; estimatedWeight: number }[];
  stressScenarios: StressScenario[];
  recommendations: string[];
  portfolioSummary: string;
}
