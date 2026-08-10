import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('calendar') ?? {};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
