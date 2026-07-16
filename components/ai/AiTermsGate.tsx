'use client';

import { useState } from 'react';
import Link from 'next/link';
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
          <p className="text-sm font-semibold text-foreground">Ask Bull</p>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
            Beta
          </span>
        </div>
        <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
          Research companies and explore investment ideas with BullPen&rsquo;s AI assistant.
        </p>
      </div>

      <ul className="w-full max-w-[300px] space-y-2.5 text-left">
        <DisclosureItem>
          Your messages are sent to OpenAI for processing. We don&rsquo;t use your data to train AI models.
        </DisclosureItem>
        <DisclosureItem>
          Ask Bull provides general, educational information only — it&rsquo;s not personal
          financial advice. Always do your own research before investing. See our{' '}
          <Link href="/disclosures" className="underline hover:text-foreground" target="_blank">
            Disclosures
          </Link>
          .
        </DisclosureItem>
        <DisclosureItem>
          You&rsquo;re talking to an AI, not a human advisor, and it can make mistakes.
        </DisclosureItem>
        <DisclosureItem>
          You can request access to or deletion of your data at any time — see our{' '}
          <Link href="/privacy" className="underline hover:text-foreground" target="_blank">
            Privacy Policy
          </Link>
          .
        </DisclosureItem>
      </ul>

      <Button onClick={handleEnable} disabled={submitting} className="w-full max-w-[200px]">
        {submitting ? 'Enabling…' : 'Enable Ask Bull'}
      </Button>
    </div>
  );
}
