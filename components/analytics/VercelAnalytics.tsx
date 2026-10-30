'use client';

import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { isAdmin, tierFromUser } from '@/lib/billing/tier';

// Set once an admin signs in, so the browser stays out of the counts after
// sign-out too (the landing page, a signed-out test). Clear it by hand to
// count yourself again: localStorage.removeItem('va-disable').
const KEY = 'va-disable';

function excluded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Vercel Web Analytics that skips the admin's own browser. */
export function VercelAnalytics() {
  const { user } = useAuth();
  const admin = !!user && isAdmin(tierFromUser(user.account_tier, user.role, user.pro_bonus_until));

  useEffect(() => {
    if (!admin) return;
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
  }, [admin]);

  return <Analytics beforeSend={(event) => (admin || excluded() ? null : event)} />;
}
