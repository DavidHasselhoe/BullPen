'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ChartTourContent } from '@/types/academy';
import type { AdvancedChartType, ChartRange } from '@/hooks/use-chart-prefs';
import {
  getIndicatorDef,
  defaultParamsFor,
  INDICATOR_PALETTE,
  INDICATOR_PRESETS,
  type IndicatorInstance,
} from '@/lib/finance/indicators';
import { CourseChartTour } from './CourseChartTour';

const AdvancedChartModal = dynamic(
  () => import('@/components/stock/advanced-chart/AdvancedChartModal').then((m) => m.AdvancedChartModal),
  { ssr: false },
);

interface Props {
  content: ChartTourContent;
  onComplete: () => void;
}

export function ChartTourLesson({ content, onComplete }: Props) {
  const [chartType, setChartType] = useState<AdvancedChartType>(content.initialChartType);
  const [range, setRange] = useState<ChartRange>(content.initialRange);
  const [indicators, setIndicators] = useState<IndicatorInstance[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(true);

  const [initialChartType] = useState(content.initialChartType);
  const [initialRangeValue] = useState(content.initialRange);

  const step = content.steps[stepIndex];

  const isActionSatisfied = useMemo(() => {
    if (!step) return true;
    switch (step.requiredAction) {
      case 'add-sma-indicator':
        return indicators.some((i) => i.type === 'sma');
      case 'switch-chart-type':
        return chartType !== initialChartType;
      case 'change-range':
        return range !== initialRangeValue;
      case 'none':
      default:
        return true;
    }
  }, [step, indicators, chartType, range, initialChartType, initialRangeValue]);

  const addIndicator = (type: string) => {
    if (indicators.some((i) => i.type === type)) return;
    const def = getIndicatorDef(type);
    if (!def) return;
    const params = defaultParamsFor(def);
    const used = new Set(indicators.map((i) => i.color));
    const color = INDICATOR_PALETTE.find((c) => !used.has(c)) ?? INDICATOR_PALETTE[indicators.length % INDICATOR_PALETTE.length];
    setIndicators((prev) => [...prev, { id: `${type}-${Date.now()}`, type, params, color }]);
  };
  const removeIndicator = (id: string) => setIndicators((prev) => prev.filter((i) => i.id !== id));
  const updateIndicator = (id: string, params: Record<string, number>) =>
    setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, params } : i)));

  const applyPreset = (presetId: string) => {
    const preset = INDICATOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const insts = preset.items
      .map((item, i) => {
        const def = getIndicatorDef(item.type);
        if (!def) return null;
        return {
          id: `${item.type}-${Date.now()}-${i}`,
          type: item.type,
          params: { ...defaultParamsFor(def), ...(item.params ?? {}) },
          color: INDICATOR_PALETTE[i % INDICATOR_PALETTE.length],
        } as IndicatorInstance;
      })
      .filter((x): x is IndicatorInstance => x != null);
    setIndicators(insts);
  };

  const finish = () => {
    setActive(false);
    onComplete();
  };

  if (!active) return null;

  return (
    <>
      <AdvancedChartModal
        ticker={content.ticker}
        initialRange={content.initialRange}
        onClose={finish}
        chartType={chartType}
        onChartType={setChartType}
        onRangeChange={setRange}
        indicators={indicators}
        onAddIndicator={addIndicator}
        onRemoveIndicator={removeIndicator}
        onUpdateIndicator={updateIndicator}
        onApplyPreset={applyPreset}
        onReplaceIndicators={setIndicators}
        onApplyConfig={(config) => {
          setChartType(config.chartType);
          setIndicators(config.indicators);
        }}
        showVolume={false}
        onToggleVolume={() => {}}
        showEvents={false}
        onToggleEvents={() => {}}
        showTransactions={false}
        onToggleTransactions={() => {}}
        sales={[]}
      />
      <CourseChartTour
        steps={content.steps}
        stepIndex={stepIndex}
        onStepIndexChange={setStepIndex}
        isActionSatisfied={isActionSatisfied}
        onSkip={finish}
        onFinish={finish}
      />
    </>
  );
}
