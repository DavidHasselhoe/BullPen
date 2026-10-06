'use client';

import { BullpenChat } from '@/components/ai/BullpenChat';
import { AiTermsGate } from '@/components/ai/AiTermsGate';
import { AuthGate } from '@/components/ai/AuthGate';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { useAuth } from '@/hooks/use-auth';
import { useAiTerms } from '@/hooks/use-ai-terms';
import { useTranslation } from 'react-i18next';
import { ToolPage, ToolHeader } from '@/components/tools/ToolHeader';

export default function AIChatClientPage() {
  const { t } = useTranslation('tools');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasAccepted } = useAiTerms();
  const needsAiTermsGate = isAuthenticated && !hasAccepted;
  // Ask Bull is a real-money per-message AI call, gated behind auth server-side.
  // Guests used to fall through to BullpenChat and hit a raw 401 from its own
  // fetch — now gated the same way as the side panel's AuthGate.
  const needsSignIn = !authLoading && !isAuthenticated;

  // Was a module-scope STARTER_PROMPTS const — i18next-cli's instrument
  // correctly refused to wrap it (a t() call there runs once at import time,
  // before i18next is initialized, and never updates on language change).
  // Moved inside the component so it re-renders in the active language.
  const starterPrompts = [
    t('aiChatStarterHoldings', 'Add 10 shares of AAPL to my holdings'),
    t('aiChatStarterInsiderBuying', 'Any insider buying in NVDA lately?'),
    t('aiChatStarterFinancialHealth', 'How healthy is AAPL financially?'),
    t('aiChatStarterRecentEarnings', "Show me AAPL's recent earnings"),
  ];

  return (
    <ToolPage>
      {/* "Ask Bull" is a brand/feature name, never translated (see
          lib/i18n/do-not-translate.ts), so it stays a string literal. The
          mascot replaces the icon tile: it is the feature's own mark. */}
      <ToolHeader
        icon={<BullAiIcon pose="idle" size={24} />}
        title={'Ask Bull'}
        description={t('aiChatSubtitle', 'Investment research assistant. Ask about SEC filings, metrics, or concepts')}
      />
      {needsSignIn ? (
        <div className="flex min-h-[420px] rounded-2xl border border-border/60">
          <AuthGate redirectTo="/tools/ai-chat" />
        </div>
      ) : needsAiTermsGate ? (
        <div className="flex min-h-[420px] rounded-2xl border border-border/60">
          <AiTermsGate />
        </div>
      ) : (
        <BullpenChat starterPrompts={starterPrompts} />
      )}
    </ToolPage>
  );
}
