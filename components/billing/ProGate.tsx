'use client';

import { Lock } from 'lucide-react';
import { useEntitlements } from '@/hooks/use-entitlements';
import type { ProFeature } from '@/lib/billing/entitlements';
import { UpgradeCTA } from './UpgradeCTA';

interface Props {
  /** Which Pro flag to check; omit to gate on Pro membership generally. */
  feature?: ProFeature;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

/**
 * Renders `children` for Pro users; otherwise a locked placeholder with an
 * upgrade CTA. Server routes must still enforce — this is UX, not security.
 */
export function ProGate({ feature, title = 'A Pro feature', description = 'Upgrade to Pro to unlock this.', children }: Props) {
  const ent = useEntitlements();
  const allowed = feature ? ent.can(feature) : ent.isPro;
  if (allowed) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <UpgradeCTA />
    </div>
  );
}
