import type { Metadata } from 'next';
import { getToolMetadata } from '@/lib/tools/tools-config';

/**
 * Also wraps /tools/deep-dive/[ticker] (no layout of its own there), which
 * is fine: that subtree is excluded from crawling in robots.ts already
 * (auth-gated + AI-cost, nothing to index), so inheriting this static title
 * as a fallback is strictly better than the generic "Tools" it fell back to
 * before, not a regression.
 */
export const metadata: Metadata = getToolMetadata('deep-dive') ?? {};

export default function DeepDiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
