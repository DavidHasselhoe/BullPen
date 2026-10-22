'use client';

import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/landing/Atoms';
import { Icon } from '@/components/landing/Icon';
import { rememberInviteCode } from '@/lib/auth/invite-cookie';
import '@/components/landing/landing-styles.css';

const loadAuthModal = () => import('@/components/auth/AuthModal');
const AuthModal = lazy(() => loadAuthModal().then((m) => ({ default: m.AuthModal })));
/** Starts the dialog's download as a finger or cursor reaches a trigger, so the tap doesn't wait on it. */
const warmAuth = { onPointerEnter: loadAuthModal, onPointerDown: loadAuthModal, onFocus: loadAuthModal };

type InviteState = 'guest' | 'member' | 'own';

const noSubscribe = () => () => {};

/**
 * "A friend sent you a month of *Pro*": the one starred word gets the serif
 * accent. Stars, not <em>, because the pseudo-locale doubles vowels.
 */
function withSerif(text: string): ReactNode {
  const [before, word, after] = text.split(/\*(.+?)\*/);
  if (word === undefined) return text;
  return (
    <>
      {before}
      <span className="accent-serif" style={{ color: 'var(--accent)' }}>{word}</span>
      {after}
    </>
  );
}

/**
 * A friend's invite link. Offer-led: the free month is the reason they came,
 * so it is the headline, the button and the line in the signup dialog, not
 * fine print under the button. The same frame serves the inviter opening
 * their own link (share it instead) and any other signed-in account.
 */
export function InviteLanding({ state, code, inviterName, url }: { state: InviteState; code: string; inviterName: string | null; url: string }) {
  const { t } = useTranslation(['auth', 'navigation']);
  const [auth, setAuth] = useState<{ open: boolean; mode: 'signup' | 'login' } | null>(null);

  // The page only renders for a code that belongs to an account, so this is
  // where the invite is remembered (not the middleware, see lib/auth/invite-cookie).
  useEffect(() => {
    if (state === 'guest') rememberInviteCode(code);
  }, [state, code]);

  const name = inviterName ?? undefined;

  return (
    <div className="bullpen-landing-root dark">
      <div className="page-bg" aria-hidden />
      <div className="page-noise" aria-hidden />

      <div className="content-layer" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <Link href="/" aria-label={t('auth:inviteHomeLabel')}>
              <Logo size="sm" />
            </Link>
            {state === 'guest' && (
              <button
                type="button"
                {...warmAuth}
                onClick={() => setAuth({ open: true, mode: 'login' })}
                className="invite-text-link"
                style={{ fontSize: 14, color: 'var(--fg-dim)', background: 'none', border: 0, cursor: 'pointer', padding: '0 4px', minHeight: 44 }}
              >
                {t('auth:inviteHaveAccount')} <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{t('auth:inviteSignIn')}</span>
              </button>
            )}
          </div>
        </header>

        <main className="wrap" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(40px, 9vh, 96px) 18px' }}>
          <div style={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
            {state === 'guest' && (
              <>
                <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(38px, 6.4vw, 64px)', color: 'var(--fg)', overflowWrap: 'anywhere' }}>
                  {withSerif(name ? t('auth:inviteHeadline', { name }) : t('auth:inviteHeadlineAnonymous'))}
                </h1>
                <p style={{ margin: '20px auto 0', maxWidth: 520, fontSize: 19, lineHeight: 1.5, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
                  {t('auth:inviteBody')}
                </p>

                {/* The action sits right under the pitch: lower down, a first visit's
                    cookie banner covered it on a 375x740 phone. */}
                <button
                  type="button"
                  {...warmAuth}
                  onClick={() => setAuth({ open: true, mode: 'signup' })}
                  className="btn btn-primary invite-cta"
                  style={{ marginTop: 28, padding: '16px 28px', fontSize: 16, minHeight: 52 }}
                >
                  {t('auth:inviteCta')}
                  <Icon name="arrowRight" size={16} />
                </button>

                <ul
                  style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 18px', fontSize: 13, color: 'var(--fg-dim)' }}
                >
                  {(['inviteNoCard', 'inviteNothingToCancel', 'inviteFreeAfter'] as const).map((key) => (
                    <li key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
                      {t(`auth:${key}`)}
                    </li>
                  ))}
                </ul>

                {/* What "Pro" means, for the reader who wants it before signing up. */}
                <div style={{ margin: '40px auto 0', paddingTop: 28, borderTop: '1px solid var(--border)', maxWidth: 420, textAlign: 'left' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)' }}>{t('auth:inviteProTitle')}</p>
                  <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 10 }}>
                    {(['inviteProBull', 'inviteProWhy', 'inviteProBrief'] as const).map((key) => (
                      <li key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.45, color: 'var(--fg)' }}>
                        <Icon name="plus" size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                        <span>{t(`auth:${key}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {state === 'member' && (
              <>
                <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(34px, 5.4vw, 52px)', color: 'var(--fg)' }}>
                  {withSerif(t('auth:inviteMemberTitle'))}
                </h1>
                <p style={{ margin: '18px auto 0', maxWidth: 480, fontSize: 17, lineHeight: 1.55, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
                  {t('auth:inviteSignedIn')}
                </p>
                <Link href="/dashboard" className="btn btn-ghost invite-cta" style={{ marginTop: 28, padding: '14px 24px', minHeight: 48 }}>
                  {t('auth:inviteSignedInCta')}
                  <Icon name="arrowRight" size={16} />
                </Link>
              </>
            )}

            {state === 'own' && <OwnLink url={url} />}
          </div>
        </main>
      </div>

      {auth && (
        <Suspense fallback={null}>
          <AuthModal
            open={auth.open}
            onOpenChange={(open) => setAuth((a) => (a ? { ...a, open } : a))}
            initialMode={auth.mode}
            redirectTo="/dashboard"
            source="invite"
            context={name ? t('auth:inviteModalContext', { name }) : t('auth:inviteModalContextAnonymous')}
          />
        </Suspense>
      )}
    </div>
  );
}

/** The inviter opening their own link, usually to check it before sending: give them the sending tools. */
function OwnLink({ url }: { url: string }) {
  const { t } = useTranslation(['auth', 'navigation']);
  const [copied, setCopied] = useState(false);
  // false on the server and in browsers without a share sheet (most desktops).
  const canShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === 'function', () => false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permission, some in-app browsers): select the link so a manual copy is one keystroke.
      const field = document.getElementById('own-invite-link') as HTMLInputElement | null;
      field?.focus();
      field?.select();
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: t('navigation:inviteShareTitle'), text: t('navigation:inviteShareText'), url });
    } catch {
      // Dismissed share sheet: nothing to do.
    }
  };

  return (
    <>
      <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(34px, 5.4vw, 52px)', color: 'var(--fg)' }}>
        {withSerif(t('auth:inviteOwnTitle'))}
      </h1>
      <p style={{ margin: '18px auto 0', maxWidth: 480, fontSize: 17, lineHeight: 1.55, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
        {t('navigation:inviteDescription')}
      </p>
      <div style={{ margin: '28px auto 0', maxWidth: 480, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor="own-invite-link" className="sr-only">{t('navigation:inviteLinkLabel')}</label>
        <input
          id="own-invite-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="mono invite-link-field"
          style={{ flex: '1 1 240px', minWidth: 0, minHeight: 48, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--fg)', fontSize: 13 }}
        />
        <button type="button" onClick={copy} className="btn btn-primary invite-cta" style={{ minHeight: 48, flex: '0 0 auto' }} aria-live="polite">
          {copied && <Icon name="check" size={16} />}
          {copied ? t('navigation:inviteCopied') : t('navigation:inviteCopy')}
        </button>
      </div>
      {canShare && (
        <button type="button" onClick={share} className="btn btn-ghost invite-cta" style={{ marginTop: 10, minHeight: 48, width: '100%', maxWidth: 480, justifyContent: 'center' }}>
          {t('navigation:inviteShare')}
        </button>
      )}
      <p style={{ margin: '16px auto 0', maxWidth: 480, fontSize: 13, lineHeight: 1.5, color: 'var(--fg-dim)' }}>
        {t('navigation:inviteLimits')}
      </p>
    </>
  );
}
