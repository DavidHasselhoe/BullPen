import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { TermlyEmbed } from '@/components/legal/TermlyEmbed';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description: 'Our commitment to accessibility and how to reach us about it.',
  alternates: { canonical: '/accessibility' },
};

export default function AccessibilityStatementPage() {
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
          <TermlyEmbed policyId="d8ff288f-2379-4bf2-97c4-47bfe5f5a3d7" height={2800} />
        </main>

        <Footer />
      </div>
    </div>
  );
}
