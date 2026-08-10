import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { TermlyEmbed } from '@/components/legal/TermlyEmbed';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How BullPen collects, uses, and protects your personal information.',
};

export default function PrivacyPolicyPage() {
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
          <TermlyEmbed policyId="02e65a84-50e5-4e4b-b2b9-7f9d49a82558" />
        </main>

        <Footer />
      </div>
    </div>
  );
}
