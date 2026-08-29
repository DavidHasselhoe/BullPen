'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PLAN_COMPARISON, PRICING } from '@/lib/billing/entitlements';
import { POSE_SRC } from '@/components/ui/EmptyState';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shown right after a successful Pro checkout. The unlocked-features list is
 * pulled from PLAN_COMPARISON (the same source /upgrade's table renders
 * below it) rather than hardcoded, so it can't drift from what was promised.
 */
export function UpgradeSuccessModal({ open, onOpenChange }: Props) {
  const { t } = useTranslation('billing');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={POSE_SRC.celebrate}
            alt=""
            aria-hidden="true"
            width={96}
            height={96}
            className="h-24 w-24 select-none dark:invert"
          />
          <DialogTitle>{t('upgradeSuccessTitle')}</DialogTitle>
          <DialogDescription>
            {t('upgradeSuccessDescription', { trialDays: PRICING.trialDays })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {PLAN_COMPARISON.map((group) => {
            const unlocked = group.rows.filter((row) => row.free !== row.pro);
            if (unlocked.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.title}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {unlocked.map((row) => (
                    <li key={row.label} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{row.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <Button asChild className="w-full">
          <Link href="/dashboard">{t('upgradeSuccessStartExploring')}</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
