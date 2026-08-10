import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('compare') ?? {};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
