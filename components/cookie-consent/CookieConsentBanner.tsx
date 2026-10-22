'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getStoredConsent, setStoredConsent, type CookieConsentValue } from '@/lib/cookie-consent/storage';

const SHOW_DELAY_MS = 500;

export function CookieConsentBanner() {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);

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
    visible && (
        <div
          role="region"
          aria-label={t('cookieBannerLabel')}
          // CSS entrance, not framer-motion: this banner was the only thing on
          // every page that pulled in framer (~44KB gzipped) for one slide-in.
          // It leaves without an exit animation.
          // left-4/bottom-5, matching NotificationToast's positioning (see
          // components/notifications/NotificationToast.tsx) — keeps clear of
          // the bottom-right "Ask Bull" toggle, with the same mobile tab-bar
          // clearance offset. On phones it is full width, so it cannot keep
          // clear: z-[51] puts it over the toggle (same z-50, later in the DOM,
          // so it painted "Ask Bull" across Accept all) until a choice is made.
          // Phones get a compact banner sitting just above the tab bar: the full
          // one covered the first screen's main button (the trial CTA on /upgrade).
          // Hidden while a modal dialog is open: Radix sets pointer-events:none
          // on <body> then, so z-[51] left the banner painted over the dialog
          // but untappable, and on a phone it sat on the signup form's submit
          // (a tap on "Accept all" pressed "Create account"). It comes back
          // when the dialog closes.
          className="animate-in fade-in zoom-in-95 slide-in-from-bottom-5 duration-300 ease-out motion-reduce:zoom-in-100 motion-reduce:slide-in-from-bottom-0 fixed bottom-5 left-4 max-md:[bottom:calc(3.5rem+0.5rem+env(safe-area-inset-bottom))] z-[51] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border bg-background p-4 shadow-lg max-sm:p-3 [body[style*='pointer-events:_none']_&]:hidden"
        >
          <p className="text-sm text-foreground max-sm:text-xs">
            {'🍪'} {t('cookieBannerText')}{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              {t('cookieBannerLearnMore')}
            </Link>
          </p>
          <div className="mt-3 flex justify-end gap-2 max-sm:mt-2">
            <Button variant="outline" size="sm" onClick={() => dismiss('rejected')}>
              {t('cookieBannerNecessaryOnly')}
            </Button>
            <Button
              size="sm"
              // Dark ink on emerald, like the landing CTA: white on emerald-500 was 2.5:1.
              className="bg-emerald-500 text-emerald-950 font-semibold hover:bg-emerald-400"
              onClick={() => dismiss('accepted')}
            >
              {t('cookieBannerAcceptAll')}
            </Button>
          </div>
        </div>
    )
  );
}
