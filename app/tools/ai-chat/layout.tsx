import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

export const metadata: Metadata = getToolMetadata('ai-chat') ?? {};

export default function AiChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
