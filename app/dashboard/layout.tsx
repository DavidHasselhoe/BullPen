import type { Metadata } from 'next';

// DashboardPage (./page.tsx) is a client component and requires a signed-in
// session — Google was indexing it with the inherited homepage title/
// description (no unique, crawlable content behind a login wall), showing up
// as a confusing second bullpen.no result next to the real homepage.
export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
