// Trend Detection v1
// Deterministic algorithms for analyzing time-series financial metrics

import type { MetricType, PeriodType } from '../types/database';

export type TrendType =
  | 'sustained_growth'
  | 'sustained_decline'
  | 'acceleration'
  | 'deceleration'
  | 'volatility_increase'
  | 'divergence';

export type TrendDirection = 'positive' | 'negative' | 'neutral';

export interface TrendResult {
  company_id: string;
  metric_type: MetricType;
  period_type: PeriodType;
  trend_type: TrendType;
  direction: TrendDirection;
  strength: number; // 0-100
  explanation: string;
  periods_analyzed: number;
  metadata: {
    values: number[];
    period_end_dates: string[];
    deltas?: number[];
    percentages?: number[];
    [key: string]: unknown;
  };
}

/**
 * Detects sustained growth or decline trend
 * Trend: Metric increases or decreases in ≥3 of last 4 periods
 */
export function detectSustainedGrowthDecline(
  companyId: string,
  metricType: MetricType,
  periodType: PeriodType,
  timeSeries: Array<{ value: number; periodEndDate: string }>
): TrendResult | null {
  // Need at least 4 periods to detect sustained trend
  if (timeSeries.length < 4) {
    return null;
  }

  // Get last 4 periods (most recent first)
  const recent = timeSeries.slice(-4).reverse(); // Reverse to get chronological order

  // Calculate period-over-period changes
  const changes: Array<{ period: string; value: number; change: number; percentage: number }> = [];
  for (let i = 1; i < recent.length; i++) {
    const current = recent[i];
    const previous = recent[i - 1];
    const change = current.value - previous.value;
    const percentage = previous.value !== 0 ? (change / previous.value) * 100 : 0;

    changes.push({
      period: current.periodEndDate,
      value: current.value,
      change,
      percentage,
    });
  }

  // Count positive and negative changes
  const positiveCount = changes.filter((c) => c.change > 0).length;
  const negativeCount = changes.filter((c) => c.change < 0).length;

  // Detect trend: ≥3 of 4 periods in same direction
  if (positiveCount >= 3) {
    // Sustained growth
    const avgGrowth = changes.reduce((sum, c) => sum + (c.change > 0 ? c.percentage : 0), 0) / positiveCount;
    const strength = Math.min(100, Math.max(40, Math.round(avgGrowth * 5))); // Scale to 0-100

  return {
    company_id: companyId,
    metric_type: metricType,
    period_type: periodType,
    trend_type: 'sustained_growth',
    direction: 'positive',
    strength,
    explanation: `Sustained growth: ${positiveCount} of last 4 periods showed positive change, with average growth of ${avgGrowth.toFixed(1)}%`,
    periods_analyzed: 4,
    metadata: {
      values: recent.map((r) => r.value),
      period_end_dates: recent.map((r) => r.periodEndDate),
      deltas: changes.map((c) => c.change),
      percentages: changes.map((c) => c.percentage),
      positive_count: positiveCount,
      negative_count: negativeCount,
    },
  };
  } else if (negativeCount >= 3) {
    // Sustained decline
    const avgDecline = Math.abs(
      changes.reduce((sum, c) => sum + (c.change < 0 ? c.percentage : 0), 0) / negativeCount
    );
    const strength = Math.min(100, Math.max(40, Math.round(avgDecline * 5))); // Scale to 0-100

  return {
    company_id: companyId,
    metric_type: metricType,
    period_type: periodType,
    trend_type: 'sustained_decline',
    direction: 'negative',
    strength,
    explanation: `Sustained decline: ${negativeCount} of last 4 periods showed negative change, with average decline of ${avgDecline.toFixed(1)}%`,
    periods_analyzed: 4,
    metadata: {
      values: recent.map((r) => r.value),
      period_end_dates: recent.map((r) => r.periodEndDate),
      deltas: changes.map((c) => c.change),
      percentages: changes.map((c) => c.percentage),
      positive_count: positiveCount,
      negative_count: negativeCount,
    },
  };
  }

  return null; // No sustained trend detected
}

/**
 * Detects acceleration or deceleration in growth rate
 * Trend: Change in growth rate over time (YoY or QoQ)
 */
export function detectAccelerationDeceleration(
  companyId: string,
  metricType: MetricType,
  periodType: PeriodType,
  timeSeries: Array<{ value: number; periodEndDate: string }>
): TrendResult | null {
  // Need at least 4 periods to compare growth rates
  if (timeSeries.length < 4) {
    return null;
  }

  // Calculate growth rates for consecutive periods
  const growthRates: number[] = [];
  for (let i = 1; i < timeSeries.length; i++) {
    const current = timeSeries[i];
    const previous = timeSeries[i - 1];
    if (previous.value !== 0) {
      const rate = ((current.value - previous.value) / previous.value) * 100;
      growthRates.push(rate);
    }
  }

  // Need at least 3 growth rates to detect acceleration/deceleration
  if (growthRates.length < 3) {
    return null;
  }

  // Compare recent growth rates vs earlier growth rates
  const recentRates = growthRates.slice(-2); // Last 2 periods
  const earlierRates = growthRates.slice(-4, -2); // 2 periods before that

  if (earlierRates.length < 1 || recentRates.length < 2) {
    return null;
  }

  const avgEarlierRate = earlierRates.reduce((sum, r) => sum + r, 0) / earlierRates.length;
  const avgRecentRate = recentRates.reduce((sum, r) => sum + r, 0) / recentRates.length;

  const changeInRate = avgRecentRate - avgEarlierRate;
  const threshold = 2.0; // Minimum 2% change in growth rate to be significant

  if (Math.abs(changeInRate) < threshold) {
    return null; // Not significant enough
  }

  // Determine if acceleration or deceleration
  if (changeInRate > 0 && avgRecentRate > 0) {
    // Accelerating growth
    const strength = Math.min(100, Math.max(30, Math.round(Math.abs(changeInRate) * 10)));
    return {
      company_id: companyId,
      metric_type: metricType,
      period_type: periodType,
      trend_type: 'acceleration',
      direction: 'positive',
      strength,
      explanation: `Accelerating growth: Growth rate increased from ${avgEarlierRate.toFixed(1)}% to ${avgRecentRate.toFixed(1)}%`,
      periods_analyzed: timeSeries.length,
      metadata: {
        values: timeSeries.map((ts) => ts.value),
        period_end_dates: timeSeries.map((ts) => ts.periodEndDate),
        growth_rates: growthRates,
        earlier_avg_rate: avgEarlierRate,
        recent_avg_rate: avgRecentRate,
        change_in_rate: changeInRate,
      },
    };
  } else if (changeInRate < 0 && avgRecentRate < 0) {
    // Accelerating decline
    const strength = Math.min(100, Math.max(30, Math.round(Math.abs(changeInRate) * 10)));
    return {
      company_id: companyId,
      metric_type: metricType,
      period_type: periodType,
      trend_type: 'acceleration',
      direction: 'negative',
      strength,
      explanation: `Accelerating decline: Decline rate increased from ${avgEarlierRate.toFixed(1)}% to ${avgRecentRate.toFixed(1)}%`,
      periods_analyzed: timeSeries.length,
      metadata: {
        values: timeSeries.map((ts) => ts.value),
        period_end_dates: timeSeries.map((ts) => ts.periodEndDate),
        growth_rates: growthRates,
        earlier_avg_rate: avgEarlierRate,
        recent_avg_rate: avgRecentRate,
        change_in_rate: changeInRate,
      },
    };
  } else if (changeInRate < 0 && avgEarlierRate > 0) {
    // Deceleration: Growth slowing down
    const strength = Math.min(100, Math.max(30, Math.round(Math.abs(changeInRate) * 10)));
    return {
      company_id: companyId,
      metric_type: metricType,
      period_type: periodType,
      trend_type: 'deceleration',
      direction: 'negative',
      strength,
      explanation: `Deceleration: Growth rate decreased from ${avgEarlierRate.toFixed(1)}% to ${avgRecentRate.toFixed(1)}%`,
      periods_analyzed: timeSeries.length,
      metadata: {
        values: timeSeries.map((ts) => ts.value),
        period_end_dates: timeSeries.map((ts) => ts.periodEndDate),
        growth_rates: growthRates,
        earlier_avg_rate: avgEarlierRate,
        recent_avg_rate: avgRecentRate,
        change_in_rate: changeInRate,
      },
    };
  } else if (changeInRate > 0 && avgEarlierRate < 0) {
    // Deceleration: Decline slowing down (recovery)
    const strength = Math.min(100, Math.max(30, Math.round(Math.abs(changeInRate) * 10)));
    return {
      company_id: companyId,
      metric_type: metricType,
      period_type: periodType,
      trend_type: 'deceleration',
      direction: 'positive',
      strength,
      explanation: `Recovery: Decline rate decreased from ${avgEarlierRate.toFixed(1)}% to ${avgRecentRate.toFixed(1)}%`,
      periods_analyzed: timeSeries.length,
      metadata: {
        values: timeSeries.map((ts) => ts.value),
        period_end_dates: timeSeries.map((ts) => ts.periodEndDate),
        growth_rates: growthRates,
        earlier_avg_rate: avgEarlierRate,
        recent_avg_rate: avgRecentRate,
        change_in_rate: changeInRate,
      },
    };
  }

  return null;
}

/**
 * Detects volatility increase
 * Trend: Significant increase in variance compared to prior periods
 */
export function detectVolatilityIncrease(
  companyId: string,
  metricType: MetricType,
  periodType: PeriodType,
  timeSeries: Array<{ value: number; periodEndDate: string }>
): TrendResult | null {
  // Need at least 6 periods to compare variance
  if (timeSeries.length < 6) {
    return null;
  }

  // Calculate percentage changes
  const changes: number[] = [];
  for (let i = 1; i < timeSeries.length; i++) {
    const current = timeSeries[i];
    const previous = timeSeries[i - 1];
    if (previous.value !== 0) {
      const change = Math.abs(((current.value - previous.value) / previous.value) * 100);
      changes.push(change);
    }
  }

  // Split into earlier and recent periods
  const midPoint = Math.floor(changes.length / 2);
  const earlierChanges = changes.slice(0, midPoint);
  const recentChanges = changes.slice(midPoint);

  if (earlierChanges.length < 2 || recentChanges.length < 2) {
    return null;
  }

  // Calculate variance (standard deviation)
  const calculateVariance = (arr: number[]): number => {
    const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance); // Standard deviation
  };

  const earlierVolatility = calculateVariance(earlierChanges);
  const recentVolatility = calculateVariance(recentChanges);

  // Check if recent volatility is significantly higher (≥50% increase)
  const volatilityIncrease = ((recentVolatility - earlierVolatility) / earlierVolatility) * 100;

  if (volatilityIncrease < 50) {
    return null; // Not significant enough
  }

  const strength = Math.min(100, Math.max(30, Math.round(volatilityIncrease / 2)));

  return {
    company_id: companyId,
    metric_type: metricType,
    period_type: periodType,
    trend_type: 'volatility_increase',
    direction: volatilityIncrease > 0 ? 'negative' : 'positive', // Higher volatility is generally negative
    strength,
    explanation: `Volatility increase: Standard deviation of period changes increased by ${volatilityIncrease.toFixed(1)}% (${earlierVolatility.toFixed(2)}% to ${recentVolatility.toFixed(2)}%)`,
    periods_analyzed: timeSeries.length,
    metadata: {
      values: timeSeries.map((ts) => ts.value),
      period_end_dates: timeSeries.map((ts) => ts.periodEndDate),
      changes,
      earlier_volatility: earlierVolatility,
      recent_volatility: recentVolatility,
      volatility_increase_percent: volatilityIncrease,
    },
  };
}

/**
 * Detects divergence between related metrics
 * Trend: Related metrics moving in opposite directions
 * Example: net_income vs free_cash_flow
 */
export function detectDivergence(
  companyId: string,
  metricType1: MetricType,
  metricType2: MetricType,
  periodType: PeriodType,
  timeSeries1: Array<{ value: number; periodEndDate: string }>,
  timeSeries2: Array<{ value: number; periodEndDate: string }>
): TrendResult | null {
  // Need at least 3 periods to detect divergence
  if (timeSeries1.length < 3 || timeSeries2.length < 3) {
    return null;
  }

  // Match periods between the two time series
  // Create a map of period_end_date to value for both series
  const map1 = new Map<string, number>();
  const map2 = new Map<string, number>();

  timeSeries1.forEach((ts) => map1.set(ts.periodEndDate, ts.value));
  timeSeries2.forEach((ts) => map2.set(ts.periodEndDate, ts.value));

  // Find common periods (periods that exist in both series)
  const commonPeriods = Array.from(map1.keys())
    .filter((date) => map2.has(date))
    .sort()
    .slice(-3); // Get last 3 common periods

  if (commonPeriods.length < 3) {
    return null; // Need at least 3 common periods
  }

  // Calculate direction of change for each metric using common periods
  const changes1: number[] = [];
  const changes2: number[] = [];

  for (let i = 1; i < commonPeriods.length; i++) {
    const prevDate = commonPeriods[i - 1];
    const currDate = commonPeriods[i];
    
    const change1 = (map1.get(currDate) || 0) - (map1.get(prevDate) || 0);
    const change2 = (map2.get(currDate) || 0) - (map2.get(prevDate) || 0);
    
    changes1.push(change1);
    changes2.push(change2);
  }

  // Check if changes are in opposite directions
  let oppositeCount = 0;
  for (let i = 0; i < changes1.length; i++) {
    if ((changes1[i] > 0 && changes2[i] < 0) || (changes1[i] < 0 && changes2[i] > 0)) {
      oppositeCount++;
    }
  }

  // Require at least 2 of 3 periods to be opposite
  if (oppositeCount < 2) {
    return null;
  }

  // Calculate magnitude of divergence
  const avgChange1 = changes1.reduce((sum, c) => sum + Math.abs(c), 0) / changes1.length;
  const avgChange2 = changes2.reduce((sum, c) => sum + Math.abs(c), 0) / changes2.length;
  const divergenceStrength = Math.max(avgChange1, avgChange2) / Math.min(avgChange1 || 1, avgChange2 || 1);

  const strength = Math.min(100, Math.max(40, Math.round(divergenceStrength * 10)));

  return {
    company_id: companyId,
    metric_type: metricType1, // Primary metric
    period_type: periodType,
    trend_type: 'divergence',
    direction: 'neutral', // Divergence is neutral by nature
    strength,
    explanation: `Divergence detected: ${metricType1} and ${metricType2} moved in opposite directions in ${oppositeCount} of ${changes1.length} recent periods`,
    periods_analyzed: commonPeriods.length,
    metadata: {
      metric_type_1: metricType1,
      metric_type_2: metricType2,
      values_1: commonPeriods.map((date) => map1.get(date) || 0),
      values_2: commonPeriods.map((date) => map2.get(date) || 0),
      period_end_dates: commonPeriods,
      changes_1: changes1,
      changes_2: changes2,
      opposite_count: oppositeCount,
      divergence_strength: divergenceStrength,
    },
  };
}
