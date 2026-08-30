'use client';

import { Loader2, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import { alertTypeLabel, describeAlert } from '@/types/alerts';
import type { ClientAction, ActionOutcome } from '@/lib/ai/tool-ux';

export type ActionableClientAction = Exclude<ClientAction, { type: 'navigate' }>;

function describeAction(action: ActionableClientAction, t: TFunction, tAlerts: TFunction): string {
  switch (action.type) {
    case 'addHolding': {
      const qty = action.quantity != null ? t('receiptQtySharesOf', { quantity: action.quantity }) : '';
      return t('receiptAddHolding', { qty, ticker: action.ticker });
    }
    case 'updateHolding': {
      const parts: string[] = [];
      if (action.quantity != null) parts.push(t('receiptSharesCount', { quantity: action.quantity }));
      if (action.avg_price != null) parts.push(t('receiptAvgPrice', { price: action.avg_price }));
      return parts.length > 0
        ? t('receiptUpdateHoldingWithDetails', { ticker: action.ticker, details: parts.join(', ') })
        : t('receiptUpdateHolding', { ticker: action.ticker });
    }
    case 'removeHolding':
      return t('receiptRemoveHolding', { ticker: action.ticker });
    case 'createAlert':
      return t('receiptCreateAlert', {
        alertType: alertTypeLabel(action.alertType, tAlerts),
        ticker: action.ticker,
        details: describeAlert({ alertType: action.alertType, threshold: action.threshold }, tAlerts),
      });
  }
}

function successMessage(action: ActionableClientAction, t: TFunction): string {
  switch (action.type) {
    case 'addHolding':
      return t('receiptAddedHolding', { ticker: action.ticker });
    case 'updateHolding':
      return t('receiptUpdatedHolding', { ticker: action.ticker });
    case 'removeHolding':
      return t('receiptRemovedHolding', { ticker: action.ticker });
    case 'createAlert':
      return t('receiptAlertSet', { ticker: action.ticker });
  }
}

interface ActionReceiptCardProps {
  action: ActionableClientAction;
  outcome?: ActionOutcome;
  /** True when this message was loaded from a past conversation, not created live this session. */
  isHistorical: boolean;
  onRetry?: () => void;
}

export function ActionReceiptCard({ action, outcome, isHistorical, onRetry }: ActionReceiptCardProps) {
  const { t } = useTranslation('ai');
  const { t: tAlerts } = useTranslation('alerts');
  const description = describeAction(action, t, tAlerts);

  // Historical messages never had their outcome recorded in this session —
  // show a neutral "requested" view instead of a fake or stuck-forever status.
  if (isHistorical && !outcome) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
        <span className="text-muted-foreground">{description}</span>
      </div>
    );
  }

  const status = outcome?.status ?? 'pending';

  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
      {status === 'pending' && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      {status === 'success' && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
      {status === 'error' && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
      <div className="min-w-0 flex-1">
        <div className={cn('text-foreground', status === 'error' && 'text-red-500')}>
          {status === 'success'
            ? outcome?.message ?? successMessage(action, t)
            : status === 'error'
              ? outcome?.message ?? t('receiptGenericError')
              : description}
        </div>
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            {t('receiptRetry')}
          </button>
        )}
      </div>
    </div>
  );
}
