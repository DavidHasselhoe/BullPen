import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CongressSection } from '@/components/congress/CongressSection';
import { SITE_URL } from '@/lib/site';

const title = 'Washington Trading: stock trades by members of Congress | BullPen';
const description = 'Stock trades disclosed by members of Congress and senior executive-branch officials, with positions and filing dates.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/discover/politicians` },
  openGraph: { title, description, url: `${SITE_URL}/discover/politicians` },
};

/** The full member list with its filters. Discover shows a one-row preview that links here. */
export default function PoliticiansPage() {
  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
      <Link
        href="/discover"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Discover
      </Link>
      <h1 className="sr-only">Washington Trading</h1>
      <CongressSection />
    </main>
  );
}
