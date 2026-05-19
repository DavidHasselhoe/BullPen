import type { Metadata } from 'next';
import { LandingClient } from '@/components/landing/LandingClient';

export const metadata: Metadata = {
  title: 'BullPen — Invest with conviction',
  description:
    'Real-time charts, AI that explains every move, and a research toolkit built for first-timers and serious traders alike. Free forever plan, no card required.',
  openGraph: {
    title: 'BullPen — Invest with conviction',
    description:
      'Real-time charts, AI that explains every move, and a research toolkit built for first-timers and serious traders alike.',
    url: '/',
    siteName: 'BullPen',
    type: 'website',
  },
};

export default function LandingPage() {
  return <LandingClient />;
}
