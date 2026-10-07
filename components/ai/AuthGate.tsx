'use client';

import { useTranslation } from 'react-i18next';
import { BullAiIcon } from './BullAiIcon';
import { useSignupGate } from '@/components/auth/SignupGate';

interface AuthGateProps {
  /** Path to return to after signing in — passed through /login's ?redirect=. Omit for surfaces (like the side panel) that stay mounted across sign-in. */
  redirectTo?: string;
}

/**
 * Shown in place of the chat when a guest reaches Ask Bull — the API route
 * requires auth (real per-message AI cost), so this avoids the raw 401 a
 * guest would otherwise see from the chat's own fetch. Shared between the
 * side panel and the dedicated /tools/ai-chat page.
 */
export function AuthGate({ redirectTo }: AuthGateProps) {
  const { t } = useTranslation('ai');
  // The sign-up dialog over the chat, account first (SignupGate). The side
  // panel stays mounted across sign-in, so it needs no redirect of its own.
  const openGate = useSignupGate();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <BullAiIcon pose="wave" size={112} />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{t('authGateTitle')}</p>
        <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
          {t('authGateDescription')}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <button
          type="button"
          onClick={() => openGate({ source: 'ask_bull', context: t('authGateDescription'), redirectTo })}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t('authGateCreateAccount')}
        </button>
        <button
          type="button"
          onClick={() => openGate({ source: 'ask_bull', mode: 'login', redirectTo })}
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          {t('authGateSignIn')}
        </button>
      </div>
    </div>
  );
}
