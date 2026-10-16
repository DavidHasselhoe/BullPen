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
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/60 data-[state=open]:text-foreground sm:h-7 sm:w-7"
          title={t('chartSettingsTitle')}
          aria-label={t('chartSettingsTitle')}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-4 max-h-[80vh] overflow-y-auto"
        aria-label={t('chartSettingsTitle')}
      >
        <h2 className="mb-4 text-sm font-semibold text-foreground">{t('chartSettingsTitle')}</h2>
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
