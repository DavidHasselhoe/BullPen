import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How BullPen protects your data.',
};

export default function SecurityPage() {
  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>Security</h1>
            <p>
              We take protecting your data seriously. Here&apos;s what&apos;s actually in place —
              not just a policy statement, but real, verifiable measures.
            </p>

            <h2>Data access controls</h2>
            <p>
              Every table in our database enforces Row Level Security, scoping data access strictly
              to its owning user. Our privileged database key is never exposed to the browser —
              it&apos;s used only in server-side code.
            </p>

            <h2>Application security</h2>
            <p>
              Every request passes through security headers (Content-Security-Policy, X-Frame-Options,
              X-Content-Type-Options, and more) and rate limiting to reduce abuse. All traffic runs over
              HTTPS, and scheduled jobs are protected by a bearer-token secret.
            </p>

            <h2>Brokerage connections</h2>
            <p>
              Our brokerage integration partner, SnapTrade, is SOC 2 Type II certified. Connections use
              OAuth — BullPen never sees or stores your brokerage login credentials. See our{' '}
              <Link href="/disclosures">Disclosures</Link> page for more on how brokerage connections work.
            </p>

            <h2>Found a security issue?</h2>
            <p>
              If you believe you&apos;ve found a security vulnerability, please{' '}
              <Link href="/contact">contact us</Link> directly rather than disclosing it publicly. We
              take reports seriously and will respond as quickly as we can.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
