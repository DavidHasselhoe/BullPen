import type { Metadata } from 'next';
import { LandingClient } from '@/components/landing/LandingClient';

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
  return <LandingClient />;
}
