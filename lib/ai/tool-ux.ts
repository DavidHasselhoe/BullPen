/**
 * Shared UX helpers for AI tool calls — used by both BullpenChat and the
 * in-chart AI assistant so the two surfaces behave consistently:
 *  - a friendly "doing X" status label while a tool is in flight
 *  - follow-up prompt suggestions based on which tool(s) just ran
 *  - extracting ticker symbols mentioned in tool calls (for cross-surface context)
 */

import type { AlertType } from '@/types/alerts';

/** Minimal shape of a `tool-*` UIMessage part — loosely typed like the rest of this codebase's message-part helpers. */
export interface ToolPart {
  type?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

interface MessageLike {
  parts?: ToolPart[];
}

/** A tool result's embedded `__clientAction` — an instruction the frontend executes after the message finishes streaming. */
export type ClientAction =
  | { type: 'navigate'; path: string }
  | { type: 'addHolding'; ticker: string; company_name: string; quantity?: number | null; avg_price?: number | null; date_purchased?: string | null }
  | { type: 'updateHolding'; ticker: string; quantity?: number | null; avg_price?: number | null }
  | { type: 'removeHolding'; ticker: string }
  | { type: 'createAlert'; ticker: string; companyName: string; alertType: AlertType; threshold: number };

/** The real-time outcome of a client action, tracked client-side once its mutation actually runs. */
export interface ActionOutcome {
  status: 'pending' | 'success' | 'error';
  message?: string;
}

const STATUS_LABELS: Record<string, string> = {
  // Company data tools
  getHealthScore: 'Checking financial health…',
  getKeyStatistics: 'Pulling valuation metrics…',
  getCompanyFinancials: 'Reading financial statements…',
  getLiveQuote: 'Fetching live price…',
  getEarningsData: 'Checking earnings history…',
  getCompanyProfile: 'Looking up company profile…',
  getLiveCompanyProfile: 'Looking up company profile…',
  getCompanyMetrics: 'Pulling historical metrics…',
  getInsiderActivity: 'Checking insider activity…',
  searchCompanies: 'Searching companies…',
  screenCompanies: 'Screening companies…',
  compareCompanies: 'Comparing companies…',
  // Navigation / portfolio (main chat only)
  openCompanyPage: 'Opening company page…',
  openComparison: 'Opening comparison…',
  openScreener: 'Opening screener…',
  openHoldings: 'Opening holdings…',
  openDiscover: 'Opening dashboard…',
  openTools: 'Opening tools…',
  openCompanyEarnings: 'Opening earnings calendar…',
  openCompanyNews: 'Opening news…',
  addHolding: 'Adding to your holdings…',
  updateHolding: 'Updating your holding…',
  removeHolding: 'Removing holding…',
  createAlert: 'Setting up your alert…',
  // Chart controls (chart assistant only)
  setTimeframe: 'Changing timeframe…',
  setChartType: 'Changing chart type…',
  addIndicator: 'Adding indicator…',
  removeIndicator: 'Removing indicator…',
  clearIndicators: 'Clearing indicators…',
  applyPreset: 'Applying preset…',
  toggleVolume: 'Updating volume display…',
  toggleEvents: 'Updating earnings markers…',
  setPriceAlert: 'Setting price alert…',
};

/** Follow-up prompts to suggest after a given tool has just answered the user. Capped to 3 by callers. */
const FOLLOWUPS: Record<string, string[]> = {
  getHealthScore: ["What's driving the score?", 'Show valuation multiples', 'Compare to a peer'],
  getKeyStatistics: ['Show financial health', 'Compare to a peer'],
  getCompanyFinancials: ['Show financial health', 'Show valuation multiples'],
  getLiveQuote: ['Show financial health', 'Show recent earnings'],
  getInsiderActivity: ['Show financial health', 'What is the current price?'],
  getEarningsData: ['Show financial health', 'What is the current price?'],
  getCompanyProfile: ['Show financial health', 'What is the current price?'],
  getLiveCompanyProfile: ['Show financial health', 'What is the current price?'],
  compareCompanies: ['Show financial health for each'],
};

function toolNameFromPart(part: ToolPart): string | null {
  if (!part.type?.startsWith('tool-')) return null;
  return part.type.slice('tool-'.length);
}

/** The tool name currently in flight (input streaming/available, no output yet) on a message, if any. */
export function getActiveToolName(message: MessageLike | undefined): string | null {
  if (!message?.parts) return null;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    const name = toolNameFromPart(part);
    if (!name) continue;
    if (part.state === 'input-streaming' || part.state === 'input-available') return name;
  }
  return null;
}

/** Human-readable status label for a tool name, e.g. "Checking financial health…". */
export function getToolStatusLabel(toolName: string | null): string | null {
  if (!toolName) return null;
  return STATUS_LABELS[toolName] ?? 'Working…';
}

/** All completed tool calls (name + output) on a message, in order. Parses each output's `__clientAction` (if present) too. */
export function getCompletedToolCalls(
  message: MessageLike | undefined
): Array<{ toolName: string; output: unknown; clientAction?: ClientAction }> {
  if (!message?.parts) return [];
  const out: Array<{ toolName: string; output: unknown; clientAction?: ClientAction }> = [];
  for (const part of message.parts) {
    const name = toolNameFromPart(part);
    if (!name || part.state !== 'output-available') continue;
    let clientAction: ClientAction | undefined;
    if (part.output && typeof part.output === 'object') {
      const raw = part.output as { __clientAction?: unknown };
      if (raw.__clientAction && typeof (raw.__clientAction as { type?: unknown }).type === 'string') {
        clientAction = raw.__clientAction as ClientAction;
      }
    }
    out.push({ toolName: name, output: part.output, clientAction });
  }
  return out;
}

/** Suggested follow-up prompts based on the last recognized tool call in a message. */
export function getFollowups(message: MessageLike | undefined, max = 3): string[] {
  const calls = getCompletedToolCalls(message);
  for (let i = calls.length - 1; i >= 0; i--) {
    const suggestions = FOLLOWUPS[calls[i].toolName];
    if (suggestions?.length) return suggestions.slice(0, max);
  }
  return [];
}

/** Ticker symbols referenced by any tool call (input args) on a message — used to share "last discussed company" context across AI surfaces. */
export function extractTickers(message: MessageLike | undefined): string[] {
  if (!message?.parts) return [];
  const out = new Set<string>();
  for (const part of message.parts) {
    if (!toolNameFromPart(part)) continue;
    const input = part.input;
    if (!input || typeof input !== 'object') continue;
    const obj = input as Record<string, unknown>;
    if (typeof obj.ticker === 'string') out.add(obj.ticker.toUpperCase());
    if (Array.isArray(obj.tickers)) {
      for (const t of obj.tickers) if (typeof t === 'string') out.add(t.toUpperCase());
    }
  }
  return [...out];
}
