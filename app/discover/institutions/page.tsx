import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { InstitutionalHoldingsSection } from '@/components/institutions/InstitutionalHoldingsSection';
import { SITE_URL } from '@/lib/site';

const title = 'Institutional 13F holdings | BullPen';
const description = 'What Berkshire, Bridgewater, Pershing Square and other large funds hold, from their quarterly SEC 13F filings.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/discover/institutions` },
  openGraph: { title, description, url: `${SITE_URL}/discover/institutions` },
};

/** The full fund list with its filters. Discover shows a one-row preview that links here. */
export default function InstitutionsPage() {
  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
      <Link
        href="/discover"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Discover
      </Link>
      <h1 className="sr-only">Institutional holdings</h1>
      <InstitutionalHoldingsSection />
    </main>
  );
}
