import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Privacy Policy — BullPen',
  description: 'How BullPen collects, uses, and protects your personal information.',
};

function readPrivacyPolicyHtml() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'privacy-policy.html');
  return fs.readFileSync(filePath, 'utf-8');
}

export default function PrivacyPolicyPage() {
  const html = readPrivacyPolicyHtml();

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
          <div className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />
        </main>

        <Footer />
      </div>
    </div>
  );
}
