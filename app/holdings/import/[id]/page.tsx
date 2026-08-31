import { ImportReviewClient } from '@/components/holdings/import/ImportReviewClient';

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImportReviewClient importId={id} />;
}
