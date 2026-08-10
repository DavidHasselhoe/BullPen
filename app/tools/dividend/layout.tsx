import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('dividend') ?? {};

export default function DividendLayout({ children }: { children: React.ReactNode }) {
  return children;
}
