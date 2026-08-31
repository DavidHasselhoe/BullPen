import type { Metadata } from 'next';

// UpgradePage (./page.tsx) is a client component, so metadata has to live
// here — Next.js only reads `export const metadata` from server components.
export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Compare BullPen Free and Pro plans, and start your free trial.',
  alternates: { canonical: '/upgrade' },
};

export default function UpgradeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
