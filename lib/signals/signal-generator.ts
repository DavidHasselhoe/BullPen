// Signal Generator v1
// Deterministic, rule-based signal generation from AI insights

import type { SignalDirection, SignalType } from '../types/database';
import type { AIInsight } from '../types/database';

/**
 * Generated signal
 */
export interface GeneratedSignal {
  signal_type: SignalType;
  direction: SignalDirection;
  strength: number;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
}

/**
 * Signal generation result
 */
export interface SignalGenerationResult {
  signals: GeneratedSignal[];
  summary: {
    total: number;
    bullish: number;
    bearish: number;
    neutral: number;
  };
}

/**
 * Extracts structured data from AI insight content
 */
function extractInsightData(insight: AIInsight): {
  sentiment: 'positive' | 'neutral' | 'negative';
  riskFlags: string[];
  keyPoints: string[];
  summary: string;
} {
  const content = insight.content as any;
  return {
    sentiment: content?.sentiment || 'neutral',
    riskFlags: content?.risk_flags || [],
    keyPoints: content?.key_points || [],
    summary: content?.summary || insight.summary || '',
  };
}

/**
 * Rule 1: Risk Signal
 * Generated when negative sentiment + risk flags present
 */
function generateRiskSignal(insight: AIInsight): GeneratedSignal | null {
  const data = extractInsightData(insight);
  
  // Only generate if negative sentiment AND risk flags exist
  if (data.sentiment !== 'negative' || data.riskFlags.length === 0) {
    return null;
  }

  const riskCount = data.riskFlags.length;
  
  // Strength based on number of risk flags
  // 1-2 flags: 40-50 (moderate)
  // 3-4 flags: 60-70 (high)
  // 5+ flags: 80-90 (very high)
  let strength = 40;
  if (riskCount >= 5) {
    strength = 85;
  } else if (riskCount >= 3) {
    strength = 65;
  } else {
    strength = 45;
  }

  // Adjust based on confidence
  const confidence = insight.confidence_score || 0.8;
  strength = Math.round(strength * confidence);

  return {
    signal_type: 'risk_alert',
    direction: 'bearish',
    strength: Math.min(100, Math.max(0, strength)),
    title: `Risk Alert: ${riskCount} Risk Factor${riskCount > 1 ? 's' : ''} Identified`,
    description: `Negative sentiment with ${riskCount} explicit risk${riskCount > 1 ? 's' : ''} flagged in ${insight.title || 'filing section'}.`,
    evidence: {
      sentiment: data.sentiment,
      risk_flags_count: riskCount,
      risk_flags: data.riskFlags,
      confidence: insight.confidence_score,
      section_type: insight.insight_type,
    },
  };
}

/**
 * Rule 2: Legal Pressure Signal
 * Generated from legal proceedings section
 */
function generateLegalSignal(insight: AIInsight): GeneratedSignal | null {
  // Only for legal proceedings sections
  if (insight.insight_type !== 'other' || !insight.title?.toLowerCase().includes('legal')) {
    return null;
  }

  const data = extractInsightData(insight);
  const summary = data.summary.toLowerCase();
  
  // Detect legal pressure indicators
  const pressureKeywords = [
    'investigation',
    'lawsuit',
    'litigation',
    'regulatory',
    'enforcement',
    'violation',
    'penalty',
    'settlement',
    'complaint',
    'proceeding',
  ];

  const keywordCount = pressureKeywords.filter(keyword => summary.includes(keyword)).length;
  
  if (keywordCount === 0) {
    return null; // No legal pressure detected
  }

  // Strength based on keyword density and sentiment
  let strength = 30;
  
  if (keywordCount >= 5) {
    strength = 75;
  } else if (keywordCount >= 3) {
    strength = 55;
  } else {
    strength = 40;
  }

  // Adjust for negative sentiment
  if (data.sentiment === 'negative') {
    strength += 15;
  } else if (data.sentiment === 'positive') {
    strength -= 10;
  }

  // Adjust for confidence
  const confidence = insight.confidence_score || 0.8;
  strength = Math.round(strength * confidence);

  const direction: SignalDirection = strength >= 60 ? 'bearish' : 'neutral';

  return {
    signal_type: 'legal_event',
    direction,
    strength: Math.min(100, Math.max(0, strength)),
    title: `Legal Pressure: ${keywordCount} Legal Matter${keywordCount > 1 ? 's' : ''} Detected`,
    description: `Legal proceedings section indicates ${keywordCount} legal matter${keywordCount > 1 ? 's' : ''} with ${data.sentiment} sentiment.`,
    evidence: {
      keyword_count: keywordCount,
      sentiment: data.sentiment,
      summary_preview: data.summary.substring(0, 200),
      confidence: insight.confidence_score,
    },
  };
}

/**
 * Rule 3: Financial Strength Signal
 * Generated from financial statements section
 */
function generateFinancialSignal(insight: AIInsight): GeneratedSignal | null {
  // Only for financial statements sections
  if (!insight.title?.toLowerCase().includes('financial')) {
    return null;
  }

  const data = extractInsightData(insight);
  
  // Look for financial strength indicators
  const positiveKeywords = [
    'growth',
    'increase',
    'improve',
    'strong',
    'profit',
    'revenue',
    'gain',
    'positive',
    'expansion',
  ];

  const negativeKeywords = [
    'decline',
    'decrease',
    'loss',
    'weak',
    'debt',
    'negative',
    'reduction',
    'deterioration',
  ];

  const summary = data.summary.toLowerCase();
  const positiveCount = positiveKeywords.filter(kw => summary.includes(kw)).length;
  const negativeCount = negativeKeywords.filter(kw => summary.includes(kw)).length;

  // Determine direction and strength
  let direction: SignalDirection = 'neutral';
  let strength = 50;

  if (positiveCount > negativeCount) {
    direction = 'bullish';
    strength = 50 + (positiveCount - negativeCount) * 10;
  } else if (negativeCount > positiveCount) {
    direction = 'bearish';
    strength = 50 + (negativeCount - positiveCount) * 10;
  }

  // Adjust for sentiment
  if (data.sentiment === 'positive' && direction === 'bullish') {
    strength += 10;
  } else if (data.sentiment === 'negative' && direction === 'bearish') {
    strength += 10;
  }

  // Adjust for confidence
  const confidence = insight.confidence_score || 0.8;
  strength = Math.round(strength * confidence);

  // Only generate if strength is meaningful (not neutral)
  if (strength < 45 || strength > 55) {
    return {
      signal_type: 'growth_opportunity',
      direction,
      strength: Math.min(100, Math.max(0, strength)),
      title: `Financial ${direction === 'bullish' ? 'Strength' : 'Weakness'} Signal`,
      description: `Financial statements indicate ${direction === 'bullish' ? 'positive' : 'negative'} trends with ${data.sentiment} sentiment.`,
      evidence: {
        sentiment: data.sentiment,
        positive_indicators: positiveCount,
        negative_indicators: negativeCount,
        confidence: insight.confidence_score,
      },
    };
  }

  return null; // Too neutral to generate signal
}

/**
 * Rule 4: Controls Stability Signal
 * Generated from controls and procedures section
 */
function generateControlsSignal(insight: AIInsight): GeneratedSignal | null {
  // Only for controls sections
  if (!insight.title?.toLowerCase().includes('control')) {
    return null;
  }

  const data = extractInsightData(insight);
  const summary = data.summary.toLowerCase();

  // Look for control quality indicators
  const positiveKeywords = [
    'effective',
    'adequate',
    'appropriate',
    'sufficient',
    'strong',
    'maintained',
    'compliant',
  ];

  const negativeKeywords = [
    'deficiency',
    'weakness',
    'material',
    'inadequate',
    'ineffective',
    'non-compliance',
    'violation',
  ];

  const positiveCount = positiveKeywords.filter(kw => summary.includes(kw)).length;
  const negativeCount = negativeKeywords.filter(kw => summary.includes(kw)).length;

  // Controls signals are typically neutral or bearish (weakness is concerning)
  let direction: SignalDirection = 'neutral';
  let strength = 50;

  if (negativeCount > 0) {
    direction = 'bearish';
    strength = 50 + negativeCount * 15; // Each negative indicator increases bearishness
  } else if (positiveCount >= 3) {
    direction = 'neutral'; // Strong controls are expected, not bullish
    strength = 40; // Low strength for neutral
  }

  // Adjust for confidence
  const confidence = insight.confidence_score || 0.8;
  strength = Math.round(strength * confidence);

  // Only generate if there's something meaningful
  if (negativeCount > 0 || positiveCount >= 3) {
    return {
      signal_type: negativeCount > 0 ? 'risk_alert' : 'other',
      direction,
      strength: Math.min(100, Math.max(0, strength)),
      title: negativeCount > 0
        ? `Controls Deficiency: ${negativeCount} Issue${negativeCount > 1 ? 's' : ''} Detected`
        : 'Controls Stability: Effective Controls Maintained',
      description: negativeCount > 0
        ? `Controls and procedures section identifies ${negativeCount} control deficiency${negativeCount > 1 ? 'ies' : ''}, indicating potential operational risks.`
        : `Controls evaluation indicates effective internal controls with ${positiveCount} positive indicators.`,
      evidence: {
        positive_indicators: positiveCount,
        negative_indicators: negativeCount,
        sentiment: data.sentiment,
        confidence: insight.confidence_score,
      },
    };
  }

  return null;
}

/**
 * Generates signals from a collection of AI insights
 * Applies all rules deterministically
 */
export function generateSignalsFromInsights(insights: AIInsight[]): SignalGenerationResult {
  const signals: GeneratedSignal[] = [];

  for (const insight of insights) {
    // Apply each rule
    const riskSignal = generateRiskSignal(insight);
    if (riskSignal) signals.push(riskSignal);

    const legalSignal = generateLegalSignal(insight);
    if (legalSignal) signals.push(legalSignal);

    const financialSignal = generateFinancialSignal(insight);
    if (financialSignal) signals.push(financialSignal);

    const controlsSignal = generateControlsSignal(insight);
    if (controlsSignal) signals.push(controlsSignal);
  }

  // Calculate summary
  const summary = {
    total: signals.length,
    bullish: signals.filter(s => s.direction === 'bullish').length,
    bearish: signals.filter(s => s.direction === 'bearish').length,
    neutral: signals.filter(s => s.direction === 'neutral').length,
  };

  return { signals, summary };
}
