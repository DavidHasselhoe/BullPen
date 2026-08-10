import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('screener') ?? {};

export default function ScreenerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
