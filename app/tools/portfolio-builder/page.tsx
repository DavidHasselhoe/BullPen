import { PortfolioBuilderClient } from '@/components/tools/portfolio-builder/PortfolioBuilderClient';

export const metadata = {
  title: 'Portfolio Builder · BullPen',
  description: 'Type an investment thesis. Get a high-conviction thematic portfolio.',
};

export default function PortfolioBuilderPage() {
  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Builder</h1>
        <p className="text-muted-foreground mt-1.5">
          Describe your investment thesis. BullPen AI constructs a thematic portfolio
          with allocations, rationale, and risk analysis.
        </p>
      </div>
      <PortfolioBuilderClient />
    </div>
  );
}
