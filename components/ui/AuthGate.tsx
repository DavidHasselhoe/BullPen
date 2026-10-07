'use client';

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useSignupGate } from '@/components/auth/SignupGate';
import { cn } from '@/lib/utils';

interface AuthGateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** For signup_gate_shown, e.g. 'holdings'. */
  source: string;
  /** Where to land after signing in, when the bare path isn't enough (a prefilled ?query). Defaults to this page. */
  returnTo?: string;
  /** The page's outline, shown in place of the icon so the guest sees what they'd get. */
  preview?: React.ReactNode;
}

/**
 * A whole page that needs an account. Both buttons open the sign-up dialog
 * over this page (SignupGate) instead of sending the guest to /login or
 * /register, so they keep sight of what they are unlocking and come straight
 * back. Create account leads: a guest here is far more often new than
 * signed out.
 */
export function AuthGate({ icon, title, description, source, returnTo, preview }: AuthGateProps) {
  const { t } = useTranslation('common');
  const openGate = useSignupGate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn('flex flex-col items-center text-center gap-5', preview ? 'w-full max-w-md' : 'max-w-sm')}
      >
        {preview ? (
          <div className="w-full">{preview}</div>
        ) : (
          <div className="h-16 w-16 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            type="button"
            onClick={() => openGate({ source, context: description, redirectTo: returnTo })}
            className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          >
            {t('authGateCreateAccount')}
          </button>
          <button
            type="button"
            onClick={() => openGate({ source, mode: 'login', redirectTo: returnTo })}
            className="flex-1 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:bg-accent active:scale-[0.97]"
          >
            {t('authGateSignIn')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
