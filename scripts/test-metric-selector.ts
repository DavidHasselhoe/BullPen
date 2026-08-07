// Verifies selectMetrics: REIT/bank/cyclical sector rules, the unprofitable
// default, the plain default, and the industry-preferred/sector-fallback
// classification, against the scenarios from the originating CrowdStrike bug
// (P/E 716.55 shown on an unprofitable company).
import { selectMetrics, type MetricSelectorInput, type ValuationMetric } from '../lib/finance/metric-selector';

function assertArrayEqual(actual: ValuationMetric[], expected: ValuationMetric[], msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function main() {
  // CrowdStrike-shaped case: unprofitable software, forward earnings exist.
  {
    const input: MetricSelectorInput = {
      profitMargin: -0.006,
      sector: 'Technology',
      industry: 'Software—Infrastructure',
      hasForwardEarnings: true,
      dividendYield: null,
    };
    const result = selectMetrics(input);
    assertArrayEqual(result.primary, ['P/S', 'Forward P/E'], 'CRWD-shaped primary');
    assertArrayEqual(result.secondary, ['EV/EBITDA'], 'CRWD-shaped secondary');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'CRWD-shaped hideMetrics');
    if (result.note !== 'Forward P/E assumes the company turns profitable.') {
      throw new Error(`CRWD-shaped note: got ${JSON.stringify(result.note)}`);
    }
  }

  // Unprofitable, no forward earnings — note omitted.
  {
    const result = selectMetrics({
      profitMargin: -0.1,
      sector: 'Technology',
      industry: 'Software—Application',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/S'], 'unprofitable no-forward primary');
    if (result.note !== undefined) throw new Error(`Expected no note, got ${JSON.stringify(result.note)}`);
  }

  // REIT via industry match, profitable, pays a dividend.
  {
    const result = selectMetrics({
      profitMargin: 0.15,
      sector: 'Real Estate',
      industry: 'REIT—Diversified',
      hasForwardEarnings: false,
      dividendYield: 0.04,
    });
    assertArrayEqual(result.primary, ['P/B', 'Dividend Yield'], 'REIT primary');
    assertArrayEqual(result.secondary, ['EV/EBITDA'], 'REIT secondary (no forward P/E available)');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'REIT hideMetrics');
    if (!result.note?.includes('depreciation')) throw new Error(`REIT note missing depreciation caveat: ${result.note}`);
  }

  // REIT via sector fallback (industry unknown), forward earnings available, no dividend.
  {
    const result = selectMetrics({
      profitMargin: 0.05,
      sector: 'Real Estate',
      industry: null,
      hasForwardEarnings: true,
      dividendYield: 0,
    });
    assertArrayEqual(result.primary, ['P/B'], 'REIT-by-sector primary (no dividend)');
    assertArrayEqual(result.secondary, ['EV/EBITDA', 'Forward P/E'], 'REIT-by-sector secondary');
  }

  // Bank, profitable — P/E stays, P/B added, nothing hidden.
  {
    const result = selectMetrics({
      profitMargin: 0.25,
      sector: 'Financial Services',
      industry: 'Banks—Regional',
      hasForwardEarnings: true,
      dividendYield: 0.03,
    });
    assertArrayEqual(result.primary, ['P/E', 'P/B'], 'bank profitable primary');
    assertArrayEqual(result.secondary, ['Dividend Yield'], 'bank profitable secondary');
    assertArrayEqual(result.hideMetrics, [], 'bank profitable hideMetrics');
    if (result.note !== undefined) throw new Error(`Expected no note for bank, got ${JSON.stringify(result.note)}`);
  }

  // Bank, unprofitable — P/E dropped from primary and hidden.
  {
    const result = selectMetrics({
      profitMargin: -0.02,
      sector: 'Financial Services',
      industry: 'Banks—Regional',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/B'], 'bank unprofitable primary');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'bank unprofitable hideMetrics');
  }

  // Insurance matches the same bank/insurer rule.
  {
    const result = selectMetrics({
      profitMargin: 0.1,
      sector: 'Financial Services',
      industry: 'Insurance—Property & Casualty',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/E', 'P/B'], 'insurer primary');
  }

  // Cyclical via industry match, profitable.
  {
    const result = selectMetrics({
      profitMargin: 0.18,
      sector: 'Technology',
      industry: 'Semiconductors',
      hasForwardEarnings: true,
      dividendYield: 0.01,
    });
    assertArrayEqual(result.primary, ['EV/EBITDA', 'P/S'], 'semiconductor primary');
    assertArrayEqual(result.secondary, ['P/B', 'Forward P/E'], 'semiconductor secondary');
    assertArrayEqual(result.hideMetrics, [], 'semiconductor profitable hideMetrics');
  }

  // Cyclical via sector fallback (industry unknown), unprofitable.
  {
    const result = selectMetrics({
      profitMargin: -0.03,
      sector: 'Basic Materials',
      industry: null,
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['EV/EBITDA', 'P/S'], 'mining-by-sector primary');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'mining-by-sector hideMetrics (unprofitable)');
  }

  // Plain profitable default — every optional extra present.
  {
    const result = selectMetrics({
      profitMargin: 0.2,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: true,
      dividendYield: 0.015,
    });
    assertArrayEqual(result.primary, ['P/E'], 'default primary');
    assertArrayEqual(result.secondary, ['Forward P/E', 'P/B', 'EV/EBITDA'], 'default secondary');
    assertArrayEqual(result.hideMetrics, [], 'default hideMetrics');
  }

  // Plain default, no forward earnings, no dividend.
  {
    const result = selectMetrics({
      profitMargin: 0.2,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: false,
      dividendYield: 0,
    });
    assertArrayEqual(result.secondary, ['P/B', 'EV/EBITDA'], 'default secondary, no forward P/E');
  }

  // Unknown profitability (null margin), no sector match — falls through to default, NOT unprofitable.
  {
    const result = selectMetrics({
      profitMargin: null,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/E'], 'unknown-margin treated as default, not unprofitable');
  }

  console.log('PASS: selectMetrics handles REIT, bank/insurer, cyclical, unprofitable, and default cases correctly');
}

main();
