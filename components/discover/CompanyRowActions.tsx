'use client';

import Link from 'next/link';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { ExternalLink, Scale, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';

interface CompanyRowActionsProps {
  ticker: string;
  name: string;
  className?: string;
}

/**
 * Quick actions shown on hover for company rows.
 * View company, Compare, Ask AI.
 */
export function CompanyRowActions({ ticker, name, className }: CompanyRowActionsProps) {
  const { open: openAIPanel } = useAIPanel();

  const handleAskAI = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openAIPanel({ query: `Tell me about ${ticker}` });
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Link
        href={slugToAssetPath(ticker)}
        className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="View company"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
      <Link
        href={`/tools/compare?tickers=${ticker}`}
        className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="Compare"
      >
        <Scale className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        onClick={handleAskAI}
        className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="Ask AI"
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
