export const dynamic = 'force-dynamic';

import PickDetailClient from './PickDetailClient';

export default async function PickDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <PickDetailClient date={date} />;
}
