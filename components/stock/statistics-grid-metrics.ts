import type { MetricSelection, ValuationMetric } from '@/lib/finance/metric-selector';

/**
 * Whether `metric` should render as a MetricCard given the selector's result
 * and whether the page is in simplified ("beginner") mode. In simplified
 * mode only the top primary metric renders as a card — everything else
 * demotes to the quiet "All statistics" disclosure row.
 */
export function showCard(selection: MetricSelection, isSimplified: boolean, metric: ValuationMetric): boolean {
  if (selection.hideMetrics.includes(metric)) return false;
  if (isSimplified) return selection.primary[0] === metric;
  return selection.primary.includes(metric) || selection.secondary.includes(metric);
}

/**
 * Which metric (if any) occupies the shared "headline multiple" card slot.
 * P/E and P/S never both appear in `primary` for the same company (see
 * lib/finance/metric-selector.ts's decision table), so they compete for one
 * fixed grid slot instead of each getting a dedicated position.
 */
export function headlineMetric(selection: MetricSelection, isSimplified: boolean): 'P/E' | 'P/S' | null {
  if (showCard(selection, isSimplified, 'P/E')) return 'P/E';
  if (showCard(selection, isSimplified, 'P/S')) return 'P/S';
  return null;
}

/** Whether the Forward P/E detail line should nest inside `metric`'s card. */
export function foldsForwardPe(selection: MetricSelection, metric: ValuationMetric): boolean {
  const recommended = selection.primary.includes('Forward P/E') || selection.secondary.includes('Forward P/E');
  return recommended && selection.primary[0] === metric;
}

/** `selection.note`, but only for the card that "owns" it (the top primary metric). */
export function noteFor(selection: MetricSelection, metric: ValuationMetric): string | undefined {
  return selection.primary[0] === metric ? selection.note : undefined;
}
