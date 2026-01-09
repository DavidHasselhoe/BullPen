// Composite Score Calculator v1
// Deterministic aggregation of signals into a single explainable score

import type { Signal, SignalDirection } from '../types/database';

/**
 * Composite score result
 */
export interface CompositeScore {
  composite_score: number; // 0-100
  direction: SignalDirection;
  explanation: string;
  contributing_signals: Array<{
    signal_id: string;
    signal_type: string;
    direction: SignalDirection;
    strength: number;
    contribution: number; // How much this signal contributed to the score
  }>;
  calculation_details: {
    baseline: number;
    bullish_contribution: number;
    bearish_contribution: number;
    neutral_contribution: number;
    raw_score: number;
    capped_score: number;
  };
}

/**
 * Calculates composite score from signals
 * 
 * Rules:
 * - Neutral baseline: 50
 * - Bullish signals: increase score proportionally to strength
 * - Bearish signals: decrease score proportionally to strength
 * - Neutral signals: minimal impact (0.1x multiplier)
 * - Final score capped between 0-100
 */
export function calculateCompositeScore(signals: Signal[]): CompositeScore {
  const NEUTRAL_BASELINE = 50;
  const NEUTRAL_MULTIPLIER = 0.1; // Neutral signals have minimal impact
  const BULLISH_MULTIPLIER = 1.0; // Full impact
  const BEARISH_MULTIPLIER = 1.0; // Full impact

  // Filter to active signals only
  const activeSignals = signals.filter(s => s.is_active);

  if (activeSignals.length === 0) {
    return {
      composite_score: NEUTRAL_BASELINE,
      direction: 'neutral',
      explanation: 'No active signals available for this filing.',
      contributing_signals: [],
      calculation_details: {
        baseline: NEUTRAL_BASELINE,
        bullish_contribution: 0,
        bearish_contribution: 0,
        neutral_contribution: 0,
        raw_score: NEUTRAL_BASELINE,
        capped_score: NEUTRAL_BASELINE,
      },
    };
  }

  // Calculate contributions from each signal
  const contributing_signals: CompositeScore['contributing_signals'] = [];
  let bullish_contribution = 0;
  let bearish_contribution = 0;
  let neutral_contribution = 0;

  for (const signal of activeSignals) {
    // Contribution is based on signal strength (0-100)
    // Normalize to -1 to +1 range, then scale
    const normalizedStrength = (signal.strength - 50) / 50; // -1 to +1

    let contribution = 0;
    let multiplier = 1.0;

    if (signal.direction === 'bullish') {
      multiplier = BULLISH_MULTIPLIER;
      // Bullish: positive contribution (increases score)
      contribution = normalizedStrength * signal.strength * multiplier;
      bullish_contribution += contribution;
    } else if (signal.direction === 'bearish') {
      multiplier = BEARISH_MULTIPLIER;
      // Bearish: negative contribution (decreases score)
      contribution = normalizedStrength * signal.strength * multiplier;
      bearish_contribution += contribution;
    } else {
      // Neutral: minimal impact
      multiplier = NEUTRAL_MULTIPLIER;
      contribution = normalizedStrength * signal.strength * multiplier;
      neutral_contribution += contribution;
    }

    contributing_signals.push({
      signal_id: signal.id,
      signal_type: signal.signal_type,
      direction: signal.direction,
      strength: signal.strength,
      contribution: Math.round(contribution * 100) / 100, // Round to 2 decimals
    });
  }

  // Calculate raw score
  // Start from baseline, add bullish, subtract bearish, add neutral
  const raw_score = NEUTRAL_BASELINE + bullish_contribution - bearish_contribution + neutral_contribution;

  // Cap between 0 and 100
  const capped_score = Math.max(0, Math.min(100, Math.round(raw_score * 100) / 100));

  // Determine direction based on capped score
  let direction: SignalDirection;
  if (capped_score >= 60) {
    direction = 'bullish';
  } else if (capped_score <= 39) {
    direction = 'bearish';
  } else {
    direction = 'neutral';
  }

  // Generate explanation
  const explanation = generateExplanation(
    direction,
    capped_score,
    bullish_contribution,
    bearish_contribution,
    contributing_signals
  );

  return {
    composite_score: capped_score,
    direction,
    explanation,
    contributing_signals,
    calculation_details: {
      baseline: NEUTRAL_BASELINE,
      bullish_contribution: Math.round(bullish_contribution * 100) / 100,
      bearish_contribution: Math.round(bearish_contribution * 100) / 100,
      neutral_contribution: Math.round(neutral_contribution * 100) / 100,
      raw_score: Math.round(raw_score * 100) / 100,
      capped_score,
    },
  };
}

/**
 * Generates a plain-English explanation of the composite score
 */
function generateExplanation(
  direction: SignalDirection,
  score: number,
  bullishContribution: number,
  bearishContribution: number,
  contributingSignals: CompositeScore['contributing_signals']
): string {
  const bullishCount = contributingSignals.filter(s => s.direction === 'bullish').length;
  const bearishCount = contributingSignals.filter(s => s.direction === 'bearish').length;
  const neutralCount = contributingSignals.filter(s => s.direction === 'neutral').length;

  const parts: string[] = [];

  if (direction === 'bullish') {
    parts.push(`Composite score of ${score} indicates a bullish posture`);
    if (bullishCount > 0) {
      parts.push(`driven by ${bullishCount} bullish signal${bullishCount > 1 ? 's' : ''}`);
    }
    if (bearishCount > 0) {
      parts.push(`with ${bearishCount} bearish signal${bearishCount > 1 ? 's' : ''} partially offsetting`);
    }
  } else if (direction === 'bearish') {
    parts.push(`Composite score of ${score} indicates a bearish posture`);
    if (bearishCount > 0) {
      parts.push(`driven by ${bearishCount} bearish signal${bearishCount > 1 ? 's' : ''}`);
    }
    if (bullishCount > 0) {
      parts.push(`with ${bullishCount} bullish signal${bullishCount > 1 ? 's' : ''} providing some offset`);
    }
  } else {
    parts.push(`Composite score of ${score} indicates a neutral posture`);
    if (bullishCount > 0 && bearishCount > 0) {
      parts.push(`with ${bullishCount} bullish and ${bearishCount} bearish signals balancing each other`);
    } else if (neutralCount > 0) {
      parts.push(`primarily from ${neutralCount} neutral signal${neutralCount > 1 ? 's' : ''}`);
    }
  }

  return parts.join(', ') + '.';
}

/**
 * Maps score to direction category
 */
export function getScoreDirection(score: number): SignalDirection {
  if (score >= 60) return 'bullish';
  if (score <= 39) return 'bearish';
  return 'neutral';
}
