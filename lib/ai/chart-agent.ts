/**
 * Chart Assistant agent — the AI embedded in the fullscreen advanced chart.
 *
 * It does two things: (1) reads a live snapshot of the chart the user is
 * looking at and explains/analyses it, and (2) drives the chart via the
 * chart-control tools (timeframe, chart type, indicators, alerts). Tool calls
 * return `__clientAction` payloads that the ChartAIPanel executes in-browser.
 */

import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';
import { CHART_TOOLS } from './chart-tools';

// Loose shape — mirrors ChartSnapshot from the chart-context module. Kept local
// so this server file doesn't import a client component.
interface ChartSnapshot {
  symbol: string;
  timeframe: string;
  chartType: string;
  indicators: string[];
  showVolume: boolean;
  showEvents: boolean;
  currentPrice: number | null;
  changePctToday: number | null;
  window: { bars: number; open: number; close: number; high: number; low: number; changePct: number } | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  trendHint: 'up' | 'down' | 'mixed' | null;
  recentCloses: number[];
}

const BASE_PROMPT = `You are the BullPen Chart Assistant — a sharp, friendly analyst living inside a stock chart. The user is looking at a live, interactive chart and you can BOTH explain what's on it AND change it for them.

## What you can do
You control the chart through tools. When the user asks for a change, CALL THE TOOL — do not just describe how to do it manually.
- setTimeframe — change the visible period (1D, 1W=5 days, 1M, 6M, 1Y, YTD, 5Y, MAX).
- setChartType — candles / line / area.
- addIndicator — sma, ema, wma, vwap, bbands, rsi, macd, stoch, atr, obv (pass length for MAs, e.g. a 200-day SMA).
- removeIndicator / clearIndicators.
- applyPreset — trend (SMA 50 & 200), momentum (RSI + MACD), volatility (Bollinger Bands + ATR).
- toggleVolume / toggleEvents (earnings markers).
- setPriceAlert — notify the user when price crosses a level.

You can chain several tools in one turn. "Show me the past year as a line chart with a 200-day SMA and volume" = four tool calls. After acting, confirm briefly in one line.

## Reading the chart
You are given a CHART SNAPSHOT with the current timeframe, price, window stats, moving averages, RSI, and the recent close path. Ground every analysis in those numbers — cite the actual figures (e.g. "RSI is 71, so it's stretched"; "price is above its 50- and 200-day averages — a healthy uptrend"). If a value is null it means there aren't enough bars in the current timeframe; say so and offer to switch to a longer view.

## Style
- Be concise and concrete. Lead with the answer, then a short "why".
- Use plain language; briefly define a term the first time you use it.
- You are an educational guide, NOT a financial advisor. Never tell the user to buy or sell. Frame observations neutrally ("this level has acted as support"), and add a light reminder that this isn't advice when the user asks what to do.
- When a request is ambiguous ("add a moving average"), pick a sensible default (SMA 50) and mention it.
- Use markdown sparingly — short paragraphs or tight bullets.`;

function formatSnapshot(s: ChartSnapshot): string {
  const money = (n: number | null) => (n == null ? 'n/a' : `$${n}`);
  const lines: string[] = [];
  lines.push(`Symbol: ${s.symbol}`);
  lines.push(`Timeframe: ${s.timeframe} · Chart type: ${s.chartType}`);
  lines.push(`Indicators on chart: ${s.indicators.length ? s.indicators.join(', ') : 'none'}`);
  lines.push(`Volume shown: ${s.showVolume ? 'yes' : 'no'} · Earnings markers: ${s.showEvents ? 'yes' : 'no'}`);
  lines.push(
    `Current price: ${money(s.currentPrice)}${s.changePctToday != null ? ` (${s.changePctToday >= 0 ? '+' : ''}${s.changePctToday}% today)` : ''}`,
  );
  if (s.window) {
    lines.push(
      `Visible window (${s.window.bars} bars): open ${money(s.window.open)}, close ${money(s.window.close)}, high ${money(s.window.high)}, low ${money(s.window.low)}, change ${s.window.changePct >= 0 ? '+' : ''}${s.window.changePct}% over the period.`,
    );
  }
  lines.push(
    `Moving averages — SMA20: ${money(s.sma20)}, SMA50: ${money(s.sma50)}, SMA200: ${money(s.sma200)}. RSI(14): ${s.rsi14 ?? 'n/a'}. Trend read: ${s.trendHint ?? 'n/a'}.`,
  );
  if (s.recentCloses.length) lines.push(`Recent close path (oldest→newest): ${s.recentCloses.join(', ')}`);
  return lines.join('\n');
}

export async function runChartAgent(
  messages: UIMessage[],
  snapshot: ChartSnapshot | null,
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | null,
  language?: string | null,
) {
  const modelMessages = await convertToModelMessages(messages);

  const languagePrefix = language && language !== 'en'
    ? `[Language: You MUST respond entirely in ${language}. Do not switch to English.]\n\n`
    : '';

  const experiencePrefix = experienceLevel === 'beginner'
    ? `[User level: BEGINNER. Use plain everyday language. Define any financial term in parentheses the first time. Keep it short and encouraging — teach a curious newcomer, not a Wall Street desk.]\n\n`
    : experienceLevel === 'advanced'
    ? `[User level: ADVANCED. Use precise terminology freely, skip basic definitions, prioritise density and insight.]\n\n`
    : '';

  const snapshotBlock = snapshot
    ? `\n\n## CURRENT CHART SNAPSHOT\n${formatSnapshot(snapshot)}`
    : '\n\n(The chart snapshot is unavailable right now — ask the user to reopen the chart if needed.)';

  const system = languagePrefix + experiencePrefix + BASE_PROMPT + snapshotBlock;

  return streamText({
    model: openai('gpt-4o'),
    system,
    messages: modelMessages,
    tools: CHART_TOOLS,
    stopWhen: stepCountIs(8),
  });
}
