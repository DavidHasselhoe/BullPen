import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { GLOSSARY } from '@/lib/finance/glossary';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Glossary',
  description: 'Plain-English explanations of financial terms used throughout BullPen.',
};

export default function GlossaryPage() {
  const entries = Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b));

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
            <h1>Glossary</h1>
            <p>
              Plain-English explanations of the financial terms you&apos;ll see throughout BullPen —
              the same ones behind every tooltip in the app.
            </p>
            {entries.map(([term, entry]) => (
              <div key={term}>
                <h3>
                  {term} <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}>— {entry.plainLabel}</span>
                </h3>
                <p>{entry.description}</p>
              </div>
            ))}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
