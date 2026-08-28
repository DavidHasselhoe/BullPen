'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation, Trans } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BullAiIcon } from './BullAiIcon';
import { useAiTerms } from '@/hooks/use-ai-terms';

interface AiTermsGateProps {
  /** Called after the user accepts, so the caller can render the chat. */
  onAccept?: () => void;
}

function DisclosureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
      <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/**
 * One-time consent gate shown before a user's first use of Ask Bull —
 * required for GDPR transparency (Art. 13/14) and the EU AI Act's Article 50
 * "inform users they're interacting with AI" obligation. Acceptance is
 * versioned (see useAiTerms) so updated terms re-prompt existing users.
 */
export function AiTermsGate({ onAccept }: AiTermsGateProps) {
  const { t } = useTranslation('ai');
  const { accept } = useAiTerms();
  const [submitting, setSubmitting] = useState(false);

  const handleEnable = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await accept();
      onAccept?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center overflow-y-auto">
      <BullAiIcon pose="wave" size={96} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm font-semibold text-foreground">{t('askBull')}</p>
          <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
            {t('termsGateBeta')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
          {t('termsGateIntro')}
        </p>
      </div>

      <ul className="w-full max-w-[300px] space-y-2.5 text-left">
        <DisclosureItem>
          {t('termsGateDisclosureData')}
        </DisclosureItem>
        <DisclosureItem>
          <Trans
            i18nKey="termsGateDisclosureNotAdvice"
            ns="ai"
            components={{ disclosuresLink: <Link href="/disclosures" className="underline hover:text-foreground" target="_blank" /> }}
          />
        </DisclosureItem>
        <DisclosureItem>
          {t('termsGateDisclosureAi')}
        </DisclosureItem>
        <DisclosureItem>
          <Trans
            i18nKey="termsGateDisclosurePrivacy"
            ns="ai"
            components={{ privacyLink: <Link href="/privacy" className="underline hover:text-foreground" target="_blank" /> }}
          />
        </DisclosureItem>
      </ul>

      <Button onClick={handleEnable} disabled={submitting} className="w-full max-w-[200px]">
        {submitting ? t('termsGateEnabling') : t('termsGateEnableButton')}
      </Button>
    </div>
  );
}
