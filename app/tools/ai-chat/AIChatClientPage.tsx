'use client';

import { BullpenChat } from '@/components/ai/BullpenChat';
import { AiTermsGate } from '@/components/ai/AiTermsGate';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAiTerms } from '@/hooks/use-ai-terms';

const STARTER_PROMPTS = [
  'Add 10 shares of AAPL to my holdings',
  'Any insider buying in NVDA lately?',
  'How healthy is AAPL financially?',
  "Show me AAPL's recent earnings",
];

export default function AIChatClientPage() {
  const { isAuthenticated } = useAuth();
  const { hasAccepted } = useAiTerms();
  // Signed-out visitors fall through to BullpenChat as before (the server route
  // 401s) — the terms gate only makes sense once there's a user to record it for.
  const needsAiTermsGate = isAuthenticated && !hasAccepted;

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          BullPen AI
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Investment research assistant — ask about SEC filings, metrics, or concepts
        </p>
      </div>
      {needsAiTermsGate ? (
        <div className="flex min-h-[420px] rounded-2xl border border-border/60">
          <AiTermsGate />
        </div>
      ) : (
        <BullpenChat starterPrompts={STARTER_PROMPTS} />
      )}
    </div>
  );
}
