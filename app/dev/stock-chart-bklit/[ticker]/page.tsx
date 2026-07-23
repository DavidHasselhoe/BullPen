import type { Metadata } from "next";
import { StockPricePanelBklit } from "@/components/stock/dev-bklit/StockPricePanelBklit";

export const metadata: Metadata = {
  title: "Bklit Stock Chart Demo",
  robots: { index: false, follow: false },
};

export default async function StockChartBklitDemoPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-16">
      <header>
        <h1 className="text-2xl font-semibold">Bklit stock chart — dev copy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unlinked dev page — a copy of StockPricePanel with the core price line + tooltip swapped
          to Bklit UI&apos;s LineChart. Real data via the same endpoints as the production stock page.
          Sessions, indicators, oscillators, volume, and earnings markers are intentionally dropped
          for this first pass. The production stock page is untouched.
        </p>
      </header>

      <StockPricePanelBklit ticker={ticker.toUpperCase()} />
    </div>
  );
}
