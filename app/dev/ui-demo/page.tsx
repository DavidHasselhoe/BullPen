import type { Metadata } from "next";
import AI_Prompt from "@/components/kokonutui/ai-prompt";
import {
  CandlestickChart,
  Candlestick,
  type OHLCDataPoint,
} from "@/components/charts/candlestick-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip";

export const metadata: Metadata = {
  title: "UI Library Demo",
  robots: { index: false, follow: false },
};

function generateMockOhlc(days: number): OHLCDataPoint[] {
  const data: OHLCDataPoint[] = [];
  let price = 140;
  const start = new Date("2026-06-01");

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const open = price;
    const drift = (Math.sin(i * 0.7) + Math.sin(i * 0.31)) * 1.5;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.abs(Math.sin(i * 1.3)) * 1.2;
    const low = Math.min(open, close) - Math.abs(Math.cos(i * 1.1)) * 1.2;

    data.push({ date, open, high, low, close });
    price = close;
  }

  return data;
}

const MOCK_OHLC = generateMockOhlc(30);

export default function UiDemoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-16 px-6 py-16">
      <header>
        <h1 className="text-2xl font-semibold">UI library demo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unlinked dev page — Kokonut UI and Bklit UI components running on BullPen&apos;s
          existing shadcn/ui + Tailwind + Motion stack. Static/mock data only, nothing wired
          to a backend.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-medium">Kokonut UI — ai-prompt</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Animated AI input box. Submitting logs to the console — no real request is sent.
        </p>
        <div className="mt-4 flex justify-center">
          <AI_Prompt
            headerText="ui-demo"
            headerAction="Kokonut UI"
            onSubmit={(value, model) => console.log("[ui-demo] ai-prompt submit", { value, model })}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Bklit UI — candlestick-chart</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          30 days of mock OHLC data for a fictional &quot;DEMO&quot; ticker — not live TwelveData.
        </p>
        <div className="mt-4">
          <CandlestickChart
            data={MOCK_OHLC}
            margin={{ top: 16, right: 16, bottom: 40, left: 48 }}
            style={{ height: 360 }}
          >
            <Grid horizontal />
            <Candlestick fadedOpacity={0.25} />
            <ChartTooltip />
            <XAxis />
            <YAxis />
          </CandlestickChart>
        </div>
      </section>
    </div>
  );
}
