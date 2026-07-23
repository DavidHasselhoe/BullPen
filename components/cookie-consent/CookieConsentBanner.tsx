'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { getStoredConsent, setStoredConsent, type CookieConsentValue } from '@/lib/cookie-consent/storage';

const SHOW_DELAY_MS = 500;

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (getStoredConsent()) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = (value: CookieConsentValue) => {
    setStoredConsent(value);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="region"
          aria-label="Cookie consent"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.2 }
              : { type: 'spring', stiffness: 300, damping: 20 }
          }
          // left-4/bottom-5, matching NotificationToast's positioning (see
          // components/notifications/NotificationToast.tsx) — keeps clear of
          // the bottom-right "Ask Bull" toggle, with the same mobile tab-bar
          // clearance offset.
          className="fixed bottom-5 left-4 max-md:[bottom:calc(3.5rem+1.25rem+env(safe-area-inset-bottom))] z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border bg-background p-4 shadow-lg"
        >
          <p className="text-sm text-foreground">
            {'🍪'} Just the cookies that keep you logged in — no ad trackers here.{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Learn more
            </Link>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => dismiss('rejected')}>
              Necessary only
            </Button>
            <Button
              size="sm"
              className="bg-emerald-500 text-white font-semibold hover:bg-emerald-600"
              onClick={() => dismiss('accepted')}
            >
              Accept all
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
