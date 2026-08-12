import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { ContactForm } from '@/components/landing/ContactForm';
import { PageMascot } from '@/components/legal/PageMascot';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the BullPen team.',
};

export default function ContactPage() {
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
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <PageMascot pose="shrug" className="mb-3" />
            <h1 style={{ fontSize: 32, marginBottom: 8 }}>Contact</h1>
            <p style={{ color: 'var(--fg-muted)', marginBottom: 32 }}>
              Questions, feedback, or something broken? Send us a message.
            </p>
            <ContactForm />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
