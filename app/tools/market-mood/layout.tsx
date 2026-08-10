import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('market-mood') ?? {};

export default function MarketMoodLayout({ children }: { children: React.ReactNode }) {
  return children;
}
