'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shown when checkout says the email isn't verified (lib/auth/email-verification.ts).
 * Sends the link on mount, then watches for the click, which can happen on any
 * device, and calls onVerified so the page carries on to checkout by itself.
 */
export function VerifyEmailNotice({ email, onVerified, className }: {
  email?: string | null;
  onVerified: () => void;
  className?: string;
}) {
  const { t } = useTranslation('billing');
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const sentRef = useRef(false);

  const send = async () => {
    const res = await fetch('/api/auth/verify-email', { method: 'POST' }).catch(() => null);
    return !!res?.ok;
  };

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    void send();
  }, []);

  const { data } = useQuery({
    queryKey: ['email-verification'],
    queryFn: async (): Promise<{ verified: boolean }> => {
      const res = await fetch('/api/auth/verify-email');
      return res.ok ? res.json() : { verified: false };
    },
    refetchInterval: (q) => (q.state.data?.verified ? false : 4000),
    refetchOnWindowFocus: true,
  });

  const verified = !!data?.verified;
  const doneRef = useRef(false);
  useEffect(() => {
    if (!verified || doneRef.current) return;
    doneRef.current = true;
    onVerified();
  }, [verified, onVerified]);

  async function handleResend() {
    setResend('sending');
    setResend((await send()) ? 'sent' : 'error');
  }

  return (
    <div role="status" className={cn('rounded-xl border border-border bg-muted/40 p-4 text-left', className)}>
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t('verifyEmailTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {email ? t('verifyEmailBodyAddress', { email }) : t('verifyEmailBody')}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {resend === 'sent' ? t('verifyEmailResent')
              : resend === 'error' ? t('verifyEmailResendError')
              : t('verifyEmailNotArrived')}{' '}
            {resend !== 'sent' && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resend === 'sending'}
                className="min-h-6 font-medium text-foreground underline underline-offset-2 disabled:opacity-60"
              >
                {t('verifyEmailResend')}
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
