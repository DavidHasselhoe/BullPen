import type { Metadata } from 'next';

// A personal draft tied to one user's uploaded file — never indexable.
export const metadata: Metadata = {
  title: 'Review Import',
  robots: { index: false, follow: false },
};

export default function ImportReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
