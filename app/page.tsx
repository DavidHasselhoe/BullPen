import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LandingClient } from '@/components/landing/LandingClient';
import { getAvailableShots } from '@/lib/landing/screenshots';
import { getCurrentUserId } from '@/lib/auth/server-session';

export const metadata: Metadata = {
  title: 'BullPen — The market, explained.',
  description:
    'Ask why any stock moved and get a real answer, sources included. Every morning, a Daily Brief tells you before you ask. Free forever plan, no card required.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'BullPen — The market, explained.',
    description:
      'Ask why any stock moved and get a real answer, sources included. Every morning, a Daily Brief tells you before you ask.',
    url: '/',
    siteName: 'BullPen',
    type: 'website',
  },
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Recurring signed-in visitors want the dashboard, not the pitch — redirect
  // server-side (before any HTML renders, no client-side flash of the
  // marketing page first) unless ?view=landing is explicitly requested, e.g.
  // to grab a shareable link or check the FAQ/Features sections while signed
  // in (those exist only as anchors on this page, not separate routes).
  const { view } = await searchParams;
  if (view !== 'landing') {
    const userId = await getCurrentUserId();
    if (userId) redirect('/dashboard');
  }

  // Resolved on the server so the browser never requests a screenshot that
  // doesn't exist yet (see lib/landing/screenshots.ts).
  return <LandingClient shots={getAvailableShots()} />;
}
