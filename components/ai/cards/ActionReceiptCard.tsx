'use client';

import { Loader2, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { alertTypeLabel, describeAlert } from '@/types/alerts';
import type { ClientAction, ActionOutcome } from '@/lib/ai/tool-ux';

export type ActionableClientAction = Exclude<ClientAction, { type: 'navigate' }>;

function describeAction(action: ActionableClientAction): string {
  switch (action.type) {
    case 'addHolding': {
      const qty = action.quantity != null ? `${action.quantity} shares of ` : '';
      return `Add ${qty}${action.ticker} to your holdings`;
    }
    case 'updateHolding': {
      const parts: string[] = [];
      if (action.quantity != null) parts.push(`${action.quantity} shares`);
      if (action.avg_price != null) parts.push(`avg price $${action.avg_price}`);
      return parts.length > 0 ? `Update ${action.ticker} — ${parts.join(', ')}` : `Update ${action.ticker}`;
    }
    case 'removeHolding':
      return `Remove ${action.ticker} from your holdings`;
    case 'createAlert':
      return `${alertTypeLabel(action.alertType)} alert for ${action.ticker} — ${describeAlert({
        alertType: action.alertType,
        threshold: action.threshold,
      })}`;
  }
}

function successMessage(action: ActionableClientAction): string {
  switch (action.type) {
    case 'addHolding':
      return `Added ${action.ticker} to your holdings`;
    case 'updateHolding':
      return `Updated ${action.ticker}`;
    case 'removeHolding':
      return `Removed ${action.ticker} from your holdings`;
    case 'createAlert':
      return `Alert set for ${action.ticker}`;
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
  const description = describeAction(action);

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
            ? outcome?.message ?? successMessage(action)
            : status === 'error'
              ? outcome?.message ?? 'Something went wrong.'
              : description}
        </div>
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
