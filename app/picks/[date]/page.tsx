export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { getPickRowByDate } from '@/lib/picks/picks-db';
import PickDetailClient from './PickDetailClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const pick = await getPickRowByDate(date);
  return {
    title: pick ? `${pick.symbol} — Bull's Pick, ${date}` : `Bull's Pick — ${date}`,
    description: pick?.one_liner ?? "Bull's Weekly Pick — see the thesis, entry price, and tracked result.",
    alternates: { canonical: `/picks/${date}` },
  };
}

export default async function PickDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <PickDetailClient date={date} />;
}
