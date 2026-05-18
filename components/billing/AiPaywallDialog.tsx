'use client';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import type { QuotaState } from '@/lib/billing/quotas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human-readable feature name, e.g. "Portfolio Builder" */
  featureName: string;
  /** Quota state from the 402 response (used to compose the message). Optional — falls back to generic copy. */
  quota?: QuotaState;
}

function formatReset(iso: string, period: 'day' | 'month'): string {
  const d = new Date(iso);
  if (period === 'day') return `at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return `on ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
}

export function AiPaywallDialog({ open, onOpenChange, featureName, quota }: Props) {
  const isProOnly = quota?.reason === 'pro_only';

  const headline = isProOnly
    ? `${featureName} is a Pro feature`
    : `You've used your free ${featureName} ${quota?.limit === 1 ? 'run' : 'runs'} ${quota?.period === 'day' ? 'today' : 'this month'}`;

  const body = isProOnly
    ? `Upgrade to Pro to unlock ${featureName} and the rest of BullPen's AI features.`
    : quota
    ? `Resets ${formatReset(quota.resetsAt, quota.period)}. Upgrade to Pro for unlimited access — plus Daily Brief, "Why Today?", and more.`
    : `Upgrade to Pro for unlimited access to ${featureName} and more.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle>{headline}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <a href="/upgrade">Upgrade to Pro</a>
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
