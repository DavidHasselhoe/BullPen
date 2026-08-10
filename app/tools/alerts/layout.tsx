import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('alerts') ?? {};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
