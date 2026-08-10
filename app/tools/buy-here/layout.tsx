import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('buy-here') ?? {};

export default function BuyHereLayout({ children }: { children: React.ReactNode }) {
  return children;
}
