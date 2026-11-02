import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LandingClient } from '@/components/landing/LandingClient';
import { getCurrentUserId } from '@/lib/auth/server-session';

export const metadata: Metadata = {
  title: 'BullPen: investing, explained for you',
  description:
    "Every stock in plain English, and the reason behind the big moves. Built for people who aren't finance people. Free plan, no card required.",
  alternates: { canonical: '/' },
  openGraph: {
    title: 'BullPen: investing, explained for you',
    description:
      'Every stock in plain English, and the reason behind the big moves. No finance degree, no jargon, no guessing.',
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

  return <LandingClient />;
}
