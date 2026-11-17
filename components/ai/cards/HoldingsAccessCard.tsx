'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useUserSettings } from '@/hooks/use-user-settings';

/**
 * Shown under Bull's reply when getPortfolioContext came back with holdings
 * access off. One tap turns the setting on and, on the live reply, asks Bull
 * again so the answer uses the real holdings.
 */
export function HoldingsAccessCard({ isHistorical, onEnabled }: { isHistorical: boolean; onEnabled?: () => void }) {
  const { t } = useTranslation('ai');
  const { allowHoldingsContext, enableHoldingsContext } = useUserSettings();
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  if (state === 'done') {
    return <p className="mt-3 text-xs text-muted-foreground first:mt-0" role="status">{t('holdingsAccessOn')}</p>;
  }
  // Already on (turned on in Settings since), or a stale prompt from history.
  if (allowHoldingsContext || isHistorical) return null;

  const turnOn = async () => {
    setState('saving');
    try {
      await enableHoldingsContext();
      setState('done');
      onEnabled?.();
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mt-3 space-y-2 first:mt-0">
      <button
        type="button"
        onClick={turnOn}
        disabled={state === 'saving'}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary/80 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted active:scale-[0.97] disabled:opacity-70"
      >
        {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {t('holdingsAccessTurnOn')}
      </button>
      {state === 'error' && (
        <p className="text-xs text-destructive" role="alert">{t('holdingsAccessError')}</p>
      )}
    </div>
  );
}
