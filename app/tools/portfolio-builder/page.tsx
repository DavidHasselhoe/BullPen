import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { PortfolioBuilderClient } from '@/components/tools/portfolio-builder/PortfolioBuilderClient';

export const metadata = {
  title: 'Portfolio Builder · BullPen',
  description: 'Type an investment thesis. Get a high-conviction thematic portfolio.',
};

export default function PortfolioBuilderPage() {
  return (
    <div className="container mx-auto py-8 max-w-4xl px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          All tools
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Portfolio Builder</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Type an investment thesis. Get a high-conviction thematic portfolio.</p>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <PortfolioBuilderClient />
      </Suspense>
    </div>
  );
}
