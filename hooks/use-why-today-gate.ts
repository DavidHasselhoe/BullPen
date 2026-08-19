'use client';

import { useCallback, useState } from 'react';
import { useAIPanel, type WhyTodayPayload } from '@/components/ai/AIPanelProvider';
import { useEntitlements } from '@/hooks/use-entitlements';
import type { QuotaState } from '@/lib/billing/quotas';

/**
 * Why Today is a hard Pro-only gate (QUOTAS.why_today has count: 0 — no free
 * quota to spend), so entitlement is already known client-side. This mirrors
 * the shape checkQuota() would return on a 402, for AiPaywallDialog's isProOnly
 * branch — resetsAt is unused there (showResetLine is false for pro_only).
 */
const WHY_TODAY_PRO_ONLY_QUOTA: QuotaState = {
  allowed: false,
  used: 0,
  limit: 0,
  period: 'day',
  resetsAt: new Date().toISOString(),
  reason: 'pro_only',
};

/**
 * Gates a "Why?" trigger without ever firing the request for a free user —
 * unlike the other AI features (which have a real free quota and only find
 * out they're blocked from the server's 402), Why Today's answer is knowable
 * up front, so free users see the paywall instantly instead of opening the
 * panel or seeing a "Searching…" state first.
 */
export function useWhyTodayGate() {
  const { openWhyToday } = useAIPanel();
  const { can } = useEntitlements();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const requestWhyToday = useCallback(
    (payload: Omit<WhyTodayPayload, 'requestedAt'>) => {
      if (can('why_today')) {
        openWhyToday(payload);
      } else {
        setPaywallOpen(true);
      }
    },
    [can, openWhyToday]
  );

  return { requestWhyToday, paywallOpen, setPaywallOpen, paywallQuota: WHY_TODAY_PRO_ONLY_QUOTA };
}
