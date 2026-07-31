import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShareById } from '@/lib/shares/get-share';
import { ShareLanding } from './ShareLanding';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) return { title: 'Share not found' };

  const positive = share.pct >= 0;
  const who = !share.anonymous && share.username ? `@${share.username}` : 'A BullPen investor';
  const title = `${who} is ${positive ? 'up' : 'down'} ${Math.abs(share.pct).toFixed(2)}% today`;
  const description = 'Track your own portfolio with real market data and AI-powered explanations — free to start.';
  const ogImageUrl = `/api/og/share/${id}`;

  return {
    // No trailing "— BullPen" here: the root layout's title.template
    // ("%s | BullPen") already appends the brand name, so adding it here
    // duplicated it into "... — BullPen | BullPen".
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImageUrl, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) notFound();

  return <ShareLanding share={share} />;
}
