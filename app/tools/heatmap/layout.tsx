import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('heatmap') ?? {};

export default function HeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
