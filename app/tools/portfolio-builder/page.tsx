import { PortfolioBuilderClient } from '@/components/tools/portfolio-builder/PortfolioBuilderClient';

export const metadata = {
  title: 'Portfolio Builder · BullPen',
  description: 'Type an investment thesis. Get a high-conviction thematic portfolio.',
};

export default function PortfolioBuilderPage() {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <PortfolioBuilderClient />
    </div>
  );
}
