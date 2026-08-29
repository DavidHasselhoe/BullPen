import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { TermlyEmbed } from '@/components/legal/TermlyEmbed';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of BullPen.',
};

export default function TermsOfServicePage() {
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
          <div className="legal-doc" style={{ marginBottom: 40 }}>
            <h1>Refunds</h1>
            <p>
              If you are not satisfied with BullPen Pro, you can request a full refund within 30
              days of your first payment. Email us at david@hasselo.no to request one. Refunds are
              not available for renewal charges after that 30-day window, but you can cancel
              anytime to stop future billing.
            </p>
          </div>

          <TermlyEmbed policyId="706edf7e-1212-47bf-8369-e44654bb8f7b" height={16000} />
        </main>

        <Footer />
      </div>
    </div>
  );
}
