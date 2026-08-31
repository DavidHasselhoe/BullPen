import type { Metadata } from 'next';

// DiscoverPage (./page.tsx) is a client component, so metadata has to live
// here — Next.js only reads `export const metadata` from server components.
export const metadata: Metadata = {
  title: 'Discover',
  description: 'Browse trending stocks, top movers, and new opportunities across the market.',
  alternates: { canonical: '/discover' },
};

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
