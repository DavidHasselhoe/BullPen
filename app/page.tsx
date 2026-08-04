import type { Metadata } from 'next';
import { LandingClient } from '@/components/landing/LandingClient';
import { getAvailableShots } from '@/lib/landing/screenshots';

export const metadata: Metadata = {
  title: 'BullPen — The market, explained.',
  description:
    'Ask why any stock moved and get a real answer — sources included. Every morning, a Daily Brief tells you before you ask. Free forever plan, no card required.',
  openGraph: {
    title: 'BullPen — The market, explained.',
    description:
      'Ask why any stock moved and get a real answer — sources included. Every morning, a Daily Brief tells you before you ask.',
    url: '/',
    siteName: 'BullPen',
    type: 'website',
  },
};

export default function LandingPage() {
  // Resolved on the server so the browser never requests a screenshot that
  // doesn't exist yet (see lib/landing/screenshots.ts).
  return <LandingClient shots={getAvailableShots()} />;
}
