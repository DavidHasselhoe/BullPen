'use client';

import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChartPrefsControls } from './ChartPrefsControls';
import type { UseChartPrefs, ChartRange, ChartIndicator } from '@/hooks/use-chart-prefs';

interface Props extends UseChartPrefs {
  onRangeChange: (r: ChartRange) => void;
  onIndicatorsChange: (inds: ChartIndicator[]) => void;
}

export function ChartSettingsPanel({ prefs, setPref, reset, onRangeChange, onIndicatorsChange }: Props) {
  const { t } = useTranslation('stock');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground/80 hover:text-foreground hover:bg-muted/60 transition-colors"
          title={t('chartSettingsTitle')}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-4 max-h-[80vh] overflow-y-auto"
      >
        <ChartPrefsControls
          prefs={prefs}
          setPref={setPref}
          reset={reset}
          onRangeChange={onRangeChange}
          onIndicatorsChange={onIndicatorsChange}
        />
      </PopoverContent>
    </Popover>
  );
}
