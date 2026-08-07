// Verifies the pure rendering-decision helpers in statistics-grid-metrics.ts
// (showCard, headlineMetric, foldsForwardPe, noteFor) against the same
// scenarios covered in test-metric-selector.ts, since these helpers are what
// actually decides which MetricCard renders where on the stock page.
import { selectMetrics, type MetricSelectorInput } from '../lib/finance/metric-selector';
import { showCard, headlineMetric, foldsForwardPe, noteFor } from '../components/stock/statistics-grid-metrics';

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function main() {
  // Default profitable — plain default rule, P/E is the headline.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.2,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: true,
      dividendYield: 0.015,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), 'P/E', 'default headline (full)');
    assertEqual(showCard(selection, false, 'P/B'), true, 'default P/B shown (full)');
    assertEqual(showCard(selection, false, 'EV/EBITDA'), true, 'default EV/EBITDA shown (full)');
    assertEqual(foldsForwardPe(selection, 'P/E'), true, 'default folds forward P/E into P/E card');
    assertEqual(foldsForwardPe(selection, 'P/B'), false, 'default does not fold forward P/E into P/B card');
    assertEqual(noteFor(selection, 'P/E'), undefined, 'default has no note');
    assertEqual(headlineMetric(selection, true), 'P/E', 'default headline (simplified)');
    assertEqual(showCard(selection, true, 'P/B'), false, 'default P/B hidden in simplified mode');
  }

  // Unprofitable, forward earnings exist — the CrowdStrike case.
  {
    const input: MetricSelectorInput = {
      profitMargin: -0.006,
      sector: 'Technology',
      industry: 'Software—Infrastructure',
      hasForwardEarnings: true,
      dividendYield: null,
    };
    const selection = selectMetrics(input);
    assertEqual(showCard(selection, false, 'P/E'), false, 'unprofitable P/E never shown');
    assertEqual(headlineMetric(selection, false), 'P/S', 'unprofitable headline is P/S');
    assertEqual(foldsForwardPe(selection, 'P/S'), true, 'unprofitable folds forward P/E into P/S card');
    assertEqual(foldsForwardPe(selection, 'EV/EBITDA'), false, 'unprofitable does not fold forward P/E into EV/EBITDA card');
    assertEqual(typeof noteFor(selection, 'P/S'), 'string', 'unprofitable note attaches to P/S card');
    assertEqual(noteFor(selection, 'EV/EBITDA'), undefined, 'unprofitable note does not attach to EV/EBITDA card');
    assertEqual(headlineMetric(selection, true), 'P/S', 'unprofitable headline is P/S even in simplified mode');
    assertEqual(showCard(selection, true, 'P/E'), false, 'unprofitable P/E never shown, even simplified');
  }

  // REIT — P/E hidden, P/B is the headline substitute, EV/EBITDA is secondary.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.15,
      sector: 'Real Estate',
      industry: 'REIT—Diversified',
      hasForwardEarnings: true,
      dividendYield: 0.04,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), null, 'REIT has no P/E-or-P/S headline card');
    assertEqual(showCard(selection, false, 'P/B'), true, 'REIT P/B shown');
    assertEqual(showCard(selection, false, 'EV/EBITDA'), true, 'REIT EV/EBITDA shown (secondary)');
    assertEqual(foldsForwardPe(selection, 'P/B'), true, 'REIT folds forward P/E into P/B card (its primary[0])');
    assertEqual(foldsForwardPe(selection, 'EV/EBITDA'), false, 'REIT does not fold forward P/E into EV/EBITDA card');
    assertEqual(typeof noteFor(selection, 'P/B'), 'string', 'REIT note attaches to P/B card');
    assertEqual(showCard(selection, true, 'P/B'), true, 'REIT P/B shown in simplified mode');
    assertEqual(showCard(selection, true, 'EV/EBITDA'), false, 'REIT EV/EBITDA hidden in simplified mode');
  }

  // Cyclical (semiconductor), profitable — EV/EBITDA is primary[0], not P/S.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.18,
      sector: 'Technology',
      industry: 'Semiconductors',
      hasForwardEarnings: true,
      dividendYield: 0.01,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), 'P/S', 'cyclical headline is P/S (P/E not selected)');
    assertEqual(showCard(selection, false, 'EV/EBITDA'), true, 'cyclical EV/EBITDA shown');
    assertEqual(foldsForwardPe(selection, 'EV/EBITDA'), true, 'cyclical folds forward P/E into EV/EBITDA card (primary[0])');
    assertEqual(foldsForwardPe(selection, 'P/S'), false, 'cyclical does not fold forward P/E into P/S card');
    assertEqual(typeof noteFor(selection, 'EV/EBITDA'), 'string', 'cyclical note attaches to EV/EBITDA card');
    assertEqual(noteFor(selection, 'P/S'), undefined, 'cyclical note does not attach to P/S card');
  }

  // Bank, profitable — Forward P/E is never proposed for banks, so it never folds anywhere.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.25,
      sector: 'Financial Services',
      industry: 'Banks—Regional',
      hasForwardEarnings: true,
      dividendYield: 0.03,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), 'P/E', 'bank headline is P/E');
    assertEqual(showCard(selection, false, 'P/B'), true, 'bank P/B shown');
    assertEqual(foldsForwardPe(selection, 'P/E'), false, 'bank never folds forward P/E (not proposed by the selector)');
  }

  console.log('PASS: statistics-grid-metrics helpers route cards correctly across default, unprofitable, REIT, cyclical, and bank scenarios');
}

main();
