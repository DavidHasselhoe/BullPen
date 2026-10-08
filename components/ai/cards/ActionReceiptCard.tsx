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
      const qty = action.quantity != null ? t('receiptQtySharesOf', { count: action.quantity }) : '';
      return t('receiptAddHolding', { qty, ticker: action.ticker });
    }
    case 'updateHolding': {
      const parts: string[] = [];
      if (action.quantity != null) parts.push(t('receiptSharesCount', { count: action.quantity }));
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
  /** Runs the change. While there is no outcome yet, the card asks first. */
  onConfirm?: () => void;
  onCancel?: () => void;
}

/**
 * What Bull is about to change in the user's account, and then what happened.
 *
 * Nothing runs until the user presses Confirm: holdings and alerts used to be
 * written the moment the reply finished, so a sample prompt like "Add 10
 * shares of AAPL" quietly put a position in a beginner's real portfolio.
 */
export function ActionReceiptCard({ action, outcome, isHistorical, onRetry, onConfirm, onCancel }: ActionReceiptCardProps) {
  const { t } = useTranslation('ai');
  const { t: tAlerts } = useTranslation('alerts');
  const description = describeAction(action, t, tAlerts);

  // Historical messages never had their outcome recorded in this session —
  // show a neutral "requested" view instead of a fake or stuck-forever status,
  // and never resurrect a live Confirm from an old conversation.
  if (isHistorical && !outcome) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-xs">
        <span className="text-muted-foreground">{description}</span>
      </div>
    );
  }

  if (!outcome && onConfirm) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-3.5" role="group" aria-label={description}>
        <p className="text-sm font-medium text-foreground">{description}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('actionConfirmHint')}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 min-w-20 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          >
            {t('actionConfirm')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 min-w-20 items-center justify-center rounded-md border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          >
            {t('actionCancel')}
          </button>
        </div>
      </div>
    );
  }

  if (outcome?.status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-xs" role="status">
        <span className="text-muted-foreground line-through decoration-muted-foreground/40">{description}</span>
        <span className="text-muted-foreground">{t('actionCancelled')}</span>
      </div>
    );
  }

  const status = outcome?.status ?? 'pending';

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-xs" role="status">
      {status === 'pending' && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
      {/* Neutral check: emerald and red mean gain and loss in this app. */}
      {status === 'success' && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />}
      {status === 'error' && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className={cn('text-foreground', status === 'error' && 'text-destructive')}>
          {status === 'success'
            ? outcome?.message ?? successMessage(action, t)
            : status === 'error'
              ? outcome?.message ?? t('receiptGenericError')
              : description}
        </div>
        {status === 'error' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            {t('receiptRetry')}
          </button>
        )}
      </div>
    </div>
  );
}
