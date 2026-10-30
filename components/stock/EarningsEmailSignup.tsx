'use client';

/**
 * "Get Micron's results by email" for signed-out visitors, inside the stock
 * page's earnings card, plus the toast that greets them when the confirm or
 * unsubscribe link in the email lands them back on the page.
 *
 * The right half shows last quarter's results as they'd have arrived by
 * email, so the offer is concrete. Double opt-in, so success means "check
 * your inbox"; this browser remembers the sign-up (pending, then on) so a
 * return visit doesn't offer the form again. See lib/email/results-subscriptions.ts.
 */

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2, Mail, MailCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';

// ─── This browser's sign-up state per company ────────────────────────────────

type Saved = 'pending' | 'on';
const CHANGE = 'bullpen:results-email';
const storageKey = (symbol: string) => `results-email:${symbol}`;

function readSaved(symbol: string): Saved | null {
  try {
    const v = localStorage.getItem(storageKey(symbol));
    return v === 'pending' || v === 'on' ? v : null;
  } catch {
    return null;
  }
}

function writeSaved(symbol: string, value: Saved | null) {
  try {
    if (value) localStorage.setItem(storageKey(symbol), value);
    else localStorage.removeItem(storageKey(symbol));
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

function subscribeSaved(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function useSaved(symbol: string): Saved | null {
  return useSyncExternalStore(subscribeSaved, () => readSaved(symbol), () => null);
}

// ─── Landing from the email ──────────────────────────────────────────────────

type Landed = 'confirmed' | 'unsubscribed';
function readLanded(): Landed | null {
  const v = new URLSearchParams(window.location.search).get('email');
  return v === 'confirmed' || v === 'unsubscribed' ? v : null;
}
const noSubscribe = () => () => {};
function clearLandedParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('email');
  window.history.replaceState(window.history.state, '', url);
}

/** Mounted at the top of the stock page: the earnings card is lazy and far down, so it can't be the one to say it worked. */
export function EarningsEmailLanding({ symbol, name }: { symbol: string; name: string }) {
  const { t } = useTranslation('stock');
  const reduced = useReducedMotion();
  const landed = useSyncExternalStore(noSubscribe, readLanded, () => null);
  const [dismissed, setDismissed] = useState(false);

  // Dropping ?email= when the toast goes, not when it shows: the param is what
  // keeps it up, and afterwards a reload or a shared link shouldn't say it again.
  const dismiss = () => {
    setDismissed(true);
    clearLandedParam();
  };

  useEffect(() => {
    if (!landed) return;
    writeSaved(symbol, landed === 'confirmed' ? 'on' : null);
    const timer = setTimeout(() => {
      setDismissed(true);
      clearLandedParam();
    }, 8000);
    return () => clearTimeout(timer);
  }, [landed, symbol]);

  const confirmed = landed === 'confirmed';
  if (!landed) return null;
  // Portalled: the page header is a size container, which would pin a fixed child to it instead of the screen.
  return createPortal(
    <AnimatePresence>
      {landed && !dismissed && (
        <motion.div
          role="status"
          initial={reduced ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          // Top centre under the nav: someone arriving from an email gets the cookie banner bottom-left.
          className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-xl border bg-background shadow-lg"
        >
          <div className="flex items-start gap-3 p-4">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                confirmed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground',
              )}
            >
              {confirmed ? <MailCheck className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{confirmed ? t('earningsEmailToastConfirmedTitle') : t('earningsEmailToastUnsubscribedTitle')}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {confirmed ? t('earningsEmailToastConfirmedBody', { name }) : t('earningsEmailToastUnsubscribedBody', { name })}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="-mr-1 -mt-1 h-9 w-9 shrink-0" aria-label={t('earningsEmailToastDismiss')} onClick={dismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── The sign-up card ────────────────────────────────────────────────────────

type Status = 'idle' | 'sending' | 'already' | 'limited' | 'invalid' | 'error';

interface Props {
  symbol: string;
  name: string;
  /** Next report date, YYYY-MM-DD. */
  date: string;
  estimate: number | null;
  /** The last report, shown as the example email. */
  last: { date: string; actual: number | null; estimate: number | null } | null;
}

export function EarningsEmailSignup({ symbol, name, date, estimate, last }: Props) {
  const { t, i18n } = useTranslation('stock');
  const { user, isLoading } = useAuth();
  const reduced = useReducedMotion();
  const saved = useSaved(symbol);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  if (isLoading || user) return null;

  const fmt = (d: string, month: 'long' | 'short') =>
    new Intl.DateTimeFormat(i18n.language, { month, day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const next = fmt(date, 'long');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, symbol }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      if (body.status === 'sent') {
        setSentTo(email.trim());
        setStatus('idle');
        writeSaved(symbol, 'pending');
      } else if (body.status === 'already') {
        setStatus('idle');
        writeSaved(symbol, 'on');
      } else {
        setStatus(body.status === 'invalid' || body.status === 'limited' ? body.status : 'error');
      }
    } catch {
      setStatus('error');
    }
  }

  const problem =
    status === 'invalid' ? t('earningsEmailInvalid')
    : status === 'limited' ? t('earningsEmailLimited')
    : status === 'error' ? t('earningsEmailFailed')
    : null;
  const fade = reduced ? {} : { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2 } };
  const view = saved === 'on' ? 'on' : saved === 'pending' ? 'pending' : 'form';
  const titleId = `earnings-email-${symbol}`;

  return (
    <section
      aria-labelledby={titleId}
      className="grid grid-cols-1 gap-5 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] sm:p-5"
    >
      <div className="min-w-0 self-center">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'form' ? (
            <motion.div key="form" {...fade}>
              <p id={titleId} className="font-semibold">{t('earningsEmailTitle', { name })}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('earningsEmailBody', { name, date: next })}</p>
              <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label htmlFor={`${titleId}-input`} className="sr-only">{t('earningsEmailLabel')}</label>
                <Input
                  id={`${titleId}-input`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (problem) setStatus('idle');
                  }}
                  placeholder={t('earningsEmailPlaceholder')}
                  aria-invalid={status === 'invalid' || undefined}
                  aria-describedby={problem ? `${titleId}-error` : undefined}
                  className="h-11 sm:h-10"
                />
                <Button type="submit" className="h-11 shrink-0 sm:h-10" disabled={status === 'sending'}>
                  {status === 'sending'
                    ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    : <Mail className="h-4 w-4" aria-hidden />}
                  {t('earningsEmailSubmit')}
                </Button>
              </form>
              {problem && <p id={`${titleId}-error`} role="alert" className="mt-2 text-sm text-red-400">{problem}</p>}
            </motion.div>
          ) : (
            <motion.div key={view} {...fade} role="status" className="flex gap-3">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  view === 'on' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-foreground',
                )}
              >
                {view === 'on' ? <MailCheck className="h-4 w-4" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
              </span>
              <div className="min-w-0">
                <p id={titleId} className="font-semibold">
                  {view === 'on' ? t('earningsEmailOnTitle', { name }) : t('earningsEmailSentTitle')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {view === 'on'
                    ? t('earningsEmailOnBody', { date: next })
                    : sentTo ? t('earningsEmailSentBody', { email: sentTo }) : t('earningsEmailSentBodyNoEmail')}
                </p>
                {view === 'pending' && (
                  <button
                    type="button"
                    onClick={() => writeSaved(symbol, null)}
                    className="mt-1 -ml-1 inline-flex min-h-11 items-center rounded px-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('earningsEmailStartOver')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <EmailPreview name={name} last={last} estimate={estimate} nextLabel={next} lastLabel={last ? fmt(last.date, 'short') : null} />
    </section>
  );
}

/**
 * The email itself, small. Last quarter's real result when there is one,
 * otherwise the coming report with only the estimate filled in. Decorative:
 * the sentence beside it already says what the email holds.
 */
function EmailPreview({ name, last, estimate, nextLabel, lastLabel }: {
  name: string;
  last: Props['last'];
  estimate: number | null;
  nextLabel: string;
  lastLabel: string | null;
}) {
  const { t } = useTranslation('stock');
  const example = last?.actual != null && last.estimate != null ? { actual: last.actual, estimate: last.estimate } : null;
  const pct = example && example.estimate !== 0 ? ((example.actual - example.estimate) / Math.abs(example.estimate)) * 100 : null;
  const diff = example ? Math.round((example.actual - example.estimate) * 100) / 100 : 0;
  const verdict = !example ? null : diff > 0 ? 'beat' : diff < 0 ? 'missed' : 'matched';
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

  return (
    <figure aria-hidden className="min-w-0 self-center">
      <figcaption className="mb-1.5 text-xs font-medium text-muted-foreground">
        {example ? t('earningsEmailExampleLabel') : t('earningsEmailUpcomingLabel')}
      </figcaption>
      <div className="rounded-lg border border-border/70 bg-card p-3 text-xs">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="font-semibold tracking-tight text-foreground">bullpen</span>
          <span>{example ? lastLabel : nextLabel}</span>
        </div>
        <p className="mt-2 text-sm font-semibold leading-snug">
          {verdict === 'beat' ? t('earningsEmailPreviewBeat', { name })
            : verdict === 'missed' ? t('earningsEmailPreviewMissed', { name })
            : verdict === 'matched' ? t('earningsEmailPreviewMatched', { name })
            : t('earningsEmailPreviewUpcoming', { name, date: nextLabel })}
        </p>
        {example ? (
          <dl className="mt-2.5 grid grid-cols-3 gap-2 tabular-nums">
            <div>
              <dt className="text-muted-foreground">{t('earningsEmailPreviewEarned')}</dt>
              <dd className="mt-0.5 font-semibold">{money(example.actual)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('earningsEmailPreviewExpected')}</dt>
              <dd className="mt-0.5 font-semibold">{money(example.estimate)}</dd>
            </div>
            {pct != null && verdict !== 'matched' && (
              <div>
                <dt className="text-muted-foreground">{verdict === 'beat' ? t('earningsEmailPreviewBeatBy') : t('earningsEmailPreviewMissedBy')}</dt>
                <dd className={cn('mt-0.5 font-semibold', verdict === 'beat' ? 'text-emerald-400' : 'text-red-400')}>
                  {verdict === 'beat' ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <>
            {estimate != null && (
              <dl className="mt-2.5 tabular-nums">
                <dt className="text-muted-foreground">{t('earningsEmailPreviewExpected')}</dt>
                <dd className="mt-0.5 font-semibold">{money(estimate)}</dd>
              </dl>
            )}
            <p className="mt-2.5 border-t border-border/60 pt-2 text-muted-foreground">{t('earningsEmailPreviewPending')}</p>
          </>
        )}
      </div>
    </figure>
  );
}
