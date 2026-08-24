import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { PageMascot } from '@/components/legal/PageMascot';
import {
  GLOSSARY,
  canonicalGlossaryTerms,
  glossarySlug,
  relatedGlossaryTerms,
  resolveGlossaryTermFromSlug,
} from '@/lib/finance/glossary';
import '@/components/landing/landing-styles.css';

const BASE_URL = 'https://bullpen.no';

export function generateStaticParams() {
  return canonicalGlossaryTerms().map((term) => ({ term: glossarySlug(term) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ term: string }>;
}): Promise<Metadata> {
  const { term: slug } = await params;
  const term = resolveGlossaryTermFromSlug(slug);
  const entry = term ? GLOSSARY[term] : undefined;
  if (!term || !entry) return {};

  const title = `What is ${term}? ${entry.plainLabel}`;
  return {
    title,
    description: entry.description,
    alternates: { canonical: `${BASE_URL}/glossary/${slug}` },
    openGraph: { title, description: entry.description, url: `${BASE_URL}/glossary/${slug}` },
  };
}

export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ term: string }>;
}) {
  const { term: slug } = await params;
  const term = resolveGlossaryTermFromSlug(slug);
  const entry = term ? GLOSSARY[term] : undefined;
  if (!term || !entry) notFound();

  const related = relatedGlossaryTerms(term);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: term,
    description: entry.description,
    inDefinedTermSet: `${BASE_URL}/glossary`,
    url: `${BASE_URL}/glossary/${slug}`,
  };

  return (
    <div className="bullpen-landing-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/glossary" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to Glossary
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <PageMascot pose="search" className="mb-3" />
            <h1>{term}</h1>
            <p style={{ color: 'var(--fg-dim)', marginTop: -8 }}>Also called: {entry.plainLabel}</p>
            <p>{entry.description}</p>
            <p>
              BullPen calculates {term} automatically for every stock. Look up any ticker to see it
              alongside the rest of the picture, valuation, financials, and risk, in one place.
            </p>

            <div style={{ margin: '28px 0' }}>
              <Link href="/register" className="btn btn-primary">
                See {term} on a real stock, free
              </Link>
            </div>

            {related.length > 0 && (
              <>
                <h3>Related terms</h3>
                <p>
                  {related.map((t, i) => (
                    <span key={t}>
                      <Link href={`/glossary/${glossarySlug(t)}`}>{t}</Link>
                      {i < related.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              </>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
