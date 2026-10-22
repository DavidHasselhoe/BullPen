import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Icon } from '@/components/landing/Icon';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import '@/components/landing/landing-styles.css';

/**
 * An invite code that matches no account: usually a link copied only partly.
 * The generic 404 sent these people to Discover with no word about the
 * invite; this says what happened and still lets them start.
 */
export default async function InviteNotFound() {
  const t = await getServerT(await getRequestLocale(), '/invite');
  return (
    <div className="bullpen-landing-root dark">
      <div className="page-bg" aria-hidden />
      <div className="page-noise" aria-hidden />
      <div className="content-layer" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap">
            <Link href="/" aria-label={t('auth:inviteHomeLabel')}>
              <Logo size="sm" />
            </Link>
          </div>
        </header>
        <main className="wrap" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(40px, 9vh, 96px) 18px' }}>
          <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
            <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 48px)', color: 'var(--fg)' }}>
              {t('auth:inviteInvalidTitle')}
            </h1>
            <p style={{ margin: '18px auto 0', fontSize: 17, lineHeight: 1.55, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
              {t('auth:inviteInvalidBody')}
            </p>
            <Link href="/get-started" className="btn btn-primary invite-cta" style={{ marginTop: 28, padding: '16px 28px', fontSize: 16, minHeight: 52 }}>
              {t('auth:inviteInvalidCta')}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
