import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How BullPen uses cookies and similar tracking technologies.',
};

// Self-hosted (not the live Termly embed used by /terms and /privacy): Termly's
// Cookie Policy tool is driven entirely by its automated scanner, with no
// clause-level editing like the Terms and Conditions questionnaire had. Its
// generated boilerplate claimed third-party advertising/analytics cookies and
// a "Cookie Preference Center" that don't exist — the scan itself found 0
// advertising/analytics cookies (only __cf_bm and i18nextLng). Hand-corrected
// to match reality; re-sync manually if the actual cookie footprint changes.
function readCookiePolicyHtml() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'cookie-policy.html');
  return fs.readFileSync(filePath, 'utf-8');
}

export default function CookiePolicyPage() {
  const html = readCookiePolicyHtml();

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
