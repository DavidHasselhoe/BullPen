/**
 * Chart-control tools for the in-chart AI assistant.
 *
 * Unlike the data tools in ./tools.ts, these don't touch the network — each one
 * simply returns a `__clientAction` payload that the ChartAIPanel executes
 * against the live chart (change timeframe, add indicators, set alerts, …).
 * This reuses the exact `__clientAction` mechanism the main chat already uses
 * for navigation and holdings edits.
 */

import { tool, jsonSchema } from 'ai';

const CLIENT_ACTION = '__clientAction';

function clientAction<T extends Record<string, unknown>>(action: T, message: string) {
  return { [CLIENT_ACTION]: action, message } as { __clientAction: T; message: string };
}

const RANGES = ['1D', '1W', '1M', '6M', '1Y', 'YTD', '5Y', 'MAX'] as const;
const CHART_TYPES = ['candles', 'line', 'area'] as const;
const INDICATORS = ['sma', 'ema', 'wma', 'vwap', 'bbands', 'rsi', 'macd', 'stoch', 'atr', 'obv'] as const;
const PRESETS = ['trend', 'momentum', 'volatility'] as const;

const RANGE_LABEL: Record<string, string> = {
  '1D': '1 day', '1W': '5 days', '1M': '1 month', '6M': '6 months',
  '1Y': '1 year', 'YTD': 'year-to-date', '5Y': '5 years', 'MAX': 'all time',
};

// ── Timeframe ───────────────────────────────────────────────────────────────
const setTimeframe = tool({
  description:
    'Change the chart timeframe (visible range). Use when the user asks to zoom in/out or see a different period — ' +
    '"show me the last year", "zoom into today", "5 year view", "year to date".',
  inputSchema: jsonSchema<{ range: (typeof RANGES)[number] }>({
    type: 'object',
    properties: { range: { type: 'string', enum: RANGES as unknown as string[], description: 'Timeframe code' } },
    required: ['range'],
    additionalProperties: false,
  }),
  execute: async ({ range }) =>
    clientAction({ type: 'chart_set_timeframe', range }, `Timeframe set to ${RANGE_LABEL[range] ?? range}.`),
});

// ── Chart type ──────────────────────────────────────────────────────────────
const setChartType = tool({
  description:
    'Switch the chart style between candlesticks, a line, or an area chart. Use for "make it a line chart", ' +
    '"show candles", "area view".',
  inputSchema: jsonSchema<{ chartType: (typeof CHART_TYPES)[number] }>({
    type: 'object',
    properties: { chartType: { type: 'string', enum: CHART_TYPES as unknown as string[] } },
    required: ['chartType'],
    additionalProperties: false,
  }),
  execute: async ({ chartType }) =>
    clientAction({ type: 'chart_set_type', chartType }, `Switched to a ${chartType} chart.`),
});

// ── Indicators ──────────────────────────────────────────────────────────────
const addIndicator = tool({
  description:
    'Add a technical indicator overlay/oscillator to the chart. Available: ' +
    'sma (simple MA), ema (exponential MA), wma (weighted MA), vwap, bbands (Bollinger Bands), ' +
    'rsi, macd, stoch (stochastic), atr, obv. ' +
    'For moving averages, pass `length` when the user specifies a period (e.g. "add a 200-day SMA" → indicator="sma", length=200). ' +
    'Call this once per indicator — call it multiple times to add several.',
  inputSchema: jsonSchema<{ indicator: (typeof INDICATORS)[number]; length?: number }>({
    type: 'object',
    properties: {
      indicator: { type: 'string', enum: INDICATORS as unknown as string[] },
      length: { type: 'number', description: 'Optional period for moving averages (e.g. 50, 200)' },
    },
    required: ['indicator'],
    additionalProperties: false,
  }),
  execute: async ({ indicator, length }) => {
    const label = length ? `${indicator.toUpperCase()} ${length}` : indicator.toUpperCase();
    return clientAction(
      { type: 'chart_add_indicator', indicator, ...(length ? { length } : {}) },
      `Added ${label}.`,
    );
  },
});

const removeIndicator = tool({
  description: 'Remove a specific indicator from the chart by its type (e.g. "remove the RSI").',
  inputSchema: jsonSchema<{ indicator: (typeof INDICATORS)[number] }>({
    type: 'object',
    properties: { indicator: { type: 'string', enum: INDICATORS as unknown as string[] } },
    required: ['indicator'],
    additionalProperties: false,
  }),
  execute: async ({ indicator }) =>
    clientAction({ type: 'chart_remove_indicator', indicator }, `Removed ${indicator.toUpperCase()}.`),
});

const clearIndicators = tool({
  description: 'Remove ALL indicators from the chart. Use for "clear indicators", "remove everything", "reset the chart".',
  inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {}, additionalProperties: false }),
  execute: async () => clientAction({ type: 'chart_clear_indicators' }, 'Cleared all indicators.'),
});

const applyPreset = tool({
  description:
    'Apply a one-click indicator preset: ' +
    '"trend" (SMA 50 & 200), "momentum" (RSI + MACD), or "volatility" (Bollinger Bands + ATR). ' +
    'Prefer this when the user asks for a themed setup like "show me trend indicators" or "set up momentum".',
  inputSchema: jsonSchema<{ preset: (typeof PRESETS)[number] }>({
    type: 'object',
    properties: { preset: { type: 'string', enum: PRESETS as unknown as string[] } },
    required: ['preset'],
    additionalProperties: false,
  }),
  execute: async ({ preset }) =>
    clientAction({ type: 'chart_apply_preset', preset }, `Applied the ${preset} preset.`),
});

// ── Toggles ─────────────────────────────────────────────────────────────────
const toggleVolume = tool({
  description: 'Show or hide the volume bars under the chart.',
  inputSchema: jsonSchema<{ show: boolean }>({
    type: 'object',
    properties: { show: { type: 'boolean' } },
    required: ['show'],
    additionalProperties: false,
  }),
  execute: async ({ show }) =>
    clientAction({ type: 'chart_toggle_volume', show }, show ? 'Volume shown.' : 'Volume hidden.'),
});

const toggleEvents = tool({
  description: 'Show or hide earnings-date markers on the chart.',
  inputSchema: jsonSchema<{ show: boolean }>({
    type: 'object',
    properties: { show: { type: 'boolean' } },
    required: ['show'],
    additionalProperties: false,
  }),
  execute: async ({ show }) =>
    clientAction({ type: 'chart_toggle_events', show }, show ? 'Earnings markers shown.' : 'Earnings markers hidden.'),
});

// ── Price alert ─────────────────────────────────────────────────────────────
const setPriceAlert = tool({
  description:
    'Create a price alert for this stock so the user is notified when it crosses a level. ' +
    'Provide the target `price`. If the direction is obvious from the request use it ("alert me if it drops below 200" → below); ' +
    'otherwise omit it and the app infers above/below from the current price.',
  inputSchema: jsonSchema<{ price: number; direction?: 'above' | 'below' }>({
    type: 'object',
    properties: {
      price: { type: 'number', description: 'Target price in USD' },
      direction: { type: 'string', enum: ['above', 'below'] },
    },
    required: ['price'],
    additionalProperties: false,
  }),
  execute: async ({ price, direction }) =>
    clientAction(
      { type: 'chart_set_alert', price, ...(direction ? { direction } : {}) },
      `Setting an alert at $${price}${direction ? ` (${direction})` : ''}…`,
    ),
});

export const CHART_TOOLS = {
  setTimeframe,
  setChartType,
  addIndicator,
  removeIndicator,
  clearIndicators,
  applyPreset,
  toggleVolume,
  toggleEvents,
  setPriceAlert,
};
