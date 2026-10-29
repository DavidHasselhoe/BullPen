/**
 * Shared UX helpers for BullpenChat's tool calls:
 *  - a friendly "doing X" status label while a tool is in flight
 *  - follow-up prompt suggestions based on which tool(s) just ran
 *  - extracting ticker symbols mentioned in tool calls (for cross-surface context)
 *  - confirming a navigation before it happens, when the user didn't explicitly ask for it
 */

import { useCallback, useState } from 'react';
import type { AlertType } from '@/types/alerts';
import type { ChartAction } from '@/components/stock/advanced-chart/chart-context';

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

/**
 * A tool result's embedded `__clientAction` — an instruction the frontend
 * executes after the message finishes streaming.
 *
 * `navigate`'s `requiresConfirmation` is the model's own judgment call (see
 * the `explicitUserRequest` param on every navigation tool in lib/ai/tools.ts
 * and the system prompt's guidance on setting it): true when the user
 * explicitly asked to be taken somewhere ("take me to GOOGL"), false when
 * Bull is offering navigation as a helpful next step to an informational
 * question ("where can I manage my alerts?"). Only the false case renders a
 * confirm card instead of navigating immediately — see NavigateConfirmCard
 * and useNavigateConfirmations below.
 */
export type ClientAction =
  | { type: 'navigate'; path: string; label: string; requiresConfirmation: boolean }
  | { type: 'addHolding'; ticker: string; company_name: string; quantity?: number | null; avg_price?: number | null; date_purchased?: string | null }
  | { type: 'updateHolding'; ticker: string; quantity?: number | null; avg_price?: number | null }
  | { type: 'removeHolding'; ticker: string }
  | { type: 'createAlert'; ticker: string; companyName: string; alertType: AlertType; threshold: number };

/** The real-time outcome of a client action, tracked client-side once its mutation actually runs. */
export interface ActionOutcome {
  /** 'cancelled': the user declined the confirmation, nothing was changed. */
  status: 'pending' | 'success' | 'error' | 'cancelled';
  message?: string;
}

const STATUS_LABELS: Record<string, string> = {
  // Company data tools
  getHealthScore: 'Checking financial health…',
  getKeyStatistics: 'Pulling valuation metrics…',
  getCompanyFinancials: 'Reading financial statements…',
  getLiveQuote: 'Fetching live price…',
  getTechnicals: 'Reading the chart…',
  getEarningsData: 'Checking earnings history…',
  getUpcomingEarnings: 'Checking earnings dates…',
  getCompanyProfile: 'Looking up company profile…',
  getLiveCompanyProfile: 'Looking up company profile…',
  getCompanyMetrics: 'Pulling historical metrics…',
  getInsiderActivity: 'Checking insider activity…',
  searchCompanies: 'Searching companies…',
  compareCompanies: 'Comparing companies…',
  // Navigation / portfolio
  navigateTo: 'Opening that page…',
  openScreener: 'Opening screener…',
  openDividendCalculator: 'Opening dividend calculator…',
  addHolding: 'Adding to your holdings…',
  updateHolding: 'Updating your holding…',
  removeHolding: 'Removing holding…',
  createAlert: 'Setting up your alert…',
  getMyAlerts: 'Checking your alerts…',
  getPoliticianTrades: 'Checking politician trades…',
  // Chart controls (fullscreen chart only)
  setTimeframe: 'Changing timeframe…',
  setChartType: 'Changing chart type…',
  addIndicator: 'Adding indicator…',
  removeIndicator: 'Removing indicator…',
  clearIndicators: 'Clearing indicators…',
  applyPreset: 'Applying preset…',
  toggleVolume: 'Updating volume display…',
  toggleEvents: 'Updating earnings markers…',
  drawLevels: 'Drawing levels…',
};

/** Follow-up prompts to suggest after a given tool has just answered the user. Capped to 3 by callers. */
const FOLLOWUPS: Record<string, string[]> = {
  getHealthScore: ["What's driving the score?", 'Show valuation multiples', 'Compare to a peer'],
  getKeyStatistics: ['Show financial health', 'Compare to a peer'],
  getCompanyFinancials: ['Show financial health', 'Show valuation multiples'],
  getLiveQuote: ['Show financial health', 'Show recent earnings'],
  getTechnicals: ['Show recent earnings', 'Show financial health'],
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

/**
 * Looks a label up in the user's language, falling back to the English here.
 * Callers pass `(key, english) => t(key, { defaultValue: english })` from the
 * 'ai' namespace; without one, the English is returned as is.
 */
export type ToolUxTranslate = (key: string, english: string) => string;

/** Stable i18n key for an English follow-up, e.g. "Show financial health" -> followup_show_financial_health. */
export function followupKey(english: string): string {
  return 'followup_' + english.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Every label this module can show, as i18n key -> English. Feeds the en locale file. */
export function toolUxEnglishStrings(): Record<string, string> {
  const out: Record<string, string> = { toolStatus_default: 'Working…' };
  for (const [tool, label] of Object.entries(STATUS_LABELS)) out[`toolStatus_${tool}`] = label;
  for (const list of Object.values(FOLLOWUPS)) for (const f of list) out[followupKey(f)] = f;
  return out;
}

/** Human-readable status label for a tool name, e.g. "Checking financial health…". */
export function getToolStatusLabel(toolName: string | null, translate?: ToolUxTranslate): string | null {
  if (!toolName) return null;
  const english = STATUS_LABELS[toolName];
  if (!english) return translate ? translate('toolStatus_default', 'Working…') : 'Working…';
  return translate ? translate(`toolStatus_${toolName}`, english) : english;
}

/** All completed tool calls (name + output) on a message, in order. Parses each output's `__clientAction` (if present) too. */
export function getCompletedToolCalls(
  message: MessageLike | undefined
): Array<{ toolName: string; output: unknown; clientAction?: ClientAction; chartAction?: ChartAction }> {
  if (!message?.parts) return [];
  const out: Array<{ toolName: string; output: unknown; clientAction?: ClientAction; chartAction?: ChartAction }> = [];
  // Two tools can offer the same page in one reply (getUpcomingEarnings carries
  // its own calendar offer, and the model also called navigateTo for it): one
  // Yes/No card per destination.
  const offeredPaths = new Set<string>();
  for (const part of message.parts) {
    const name = toolNameFromPart(part);
    if (!name || part.state !== 'output-available') continue;
    let clientAction: ClientAction | undefined;
    let chartAction: ChartAction | undefined;
    if (part.output && typeof part.output === 'object') {
      const raw = part.output as { __clientAction?: unknown };
      const type = raw.__clientAction ? (raw.__clientAction as { type?: unknown }).type : undefined;
      // Chart controls run straight away and render no card, so they stay out of clientAction.
      if (typeof type === 'string' && type.startsWith('chart_')) chartAction = raw.__clientAction as ChartAction;
      else if (typeof type === 'string') clientAction = raw.__clientAction as ClientAction;
    }
    if (clientAction?.type === 'navigate') {
      if (offeredPaths.has(clientAction.path)) clientAction = undefined;
      else offeredPaths.add(clientAction.path);
    }
    out.push({ toolName: name, output: part.output, clientAction, chartAction });
  }
  return out;
}

/** Suggested follow-up prompts based on the last recognized tool call in a message. */
export function getFollowups(message: MessageLike | undefined, max = 3, translate?: ToolUxTranslate): string[] {
  const calls = getCompletedToolCalls(message);
  for (let i = calls.length - 1; i >= 0; i--) {
    const suggestions = FOLLOWUPS[calls[i].toolName];
    if (suggestions?.length) {
      return suggestions.slice(0, max).map((f) => (translate ? translate(followupKey(f), f) : f));
    }
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

/**
 * Writes what the user did with a card (Yes/No, Confirm/Cancel) into that
 * tool's result, so the next request tells Bull. Without it the result kept
 * saying "The user now sees Yes/No buttons" forever, and after a No Bull
 * answered every later message with "Pick Yes below" (2026-10-28). The key is
 * BullpenChat's `${message.id}::${index}`, counted like getCompletedToolCalls.
 * The pre-answer `note` / `confirmation` instructions are dropped: they
 * describe a prompt that is no longer open.
 */
export function withUserResponse<M extends { id: string; parts: unknown[] }>(messages: M[], key: string, userResponse: string): M[] {
  const sep = key.lastIndexOf('::');
  const messageId = key.slice(0, sep);
  const index = Number(key.slice(sep + 2));
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    let i = -1;
    const parts = message.parts.map((p) => {
      const part = p as ToolPart;
      if (!toolNameFromPart(part) || part.state !== 'output-available') return p;
      i++;
      if (i !== index || !part.output || typeof part.output !== 'object') return p;
      const { note: _note, confirmation: _confirmation, ...rest } = part.output as Record<string, unknown>;
      return { ...part, output: { ...rest, userResponse } };
    });
    return { ...message, parts };
  });
}

/**
 * Every answered card as key -> the userResponse line Bull should read: Yes/No
 * on navigation offers, Confirm/Cancel on holdings and alert cards.
 */
export function cardResponses(
  navigateDecisions: Record<string, NavigateDecision>,
  actionOutcomes: Record<string, ActionOutcome>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, decision] of Object.entries(navigateDecisions)) {
    out[key] = decision === 'confirmed'
      ? 'The user pressed Yes and was taken there. This offer is closed.'
      : "The user pressed No and stayed where they were. This offer is closed: don't offer it again or remind them of it unless they ask.";
  }
  for (const [key, outcome] of Object.entries(actionOutcomes)) {
    if (outcome.status === 'success') out[key] = 'The user pressed Confirm and it was saved. It is done.';
    else if (outcome.status === 'error') out[key] = `The user pressed Confirm but saving failed (${outcome.message ?? 'unknown error'}). Nothing changed.`;
    else if (outcome.status === 'cancelled') out[key] = "The user pressed Cancel. Nothing was changed. Don't bring it up again unless they ask.";
  }
  return out;
}

export type NavigateDecision = 'confirmed' | 'declined';

/**
 * Tracks the user's Yes/No decision on each navigate-with-confirmation
 * prompt, keyed the same way BullpenChat keys actionOutcomes
 * (`${message.id}::${toolCallIndex}`). Shared by BullpenChat and
 * ChartAIPanel so both surfaces confirm-before-navigate identically —
 * `push` is injected (rather than this hook importing next/navigation
 * itself) so it works with either surface's own `useRouter().push`.
 */
export function useNavigateConfirmations(push: (path: string) => void) {
  const [decisions, setDecisions] = useState<Record<string, NavigateDecision>>({});

  const confirm = useCallback((key: string, path: string) => {
    setDecisions((prev) => ({ ...prev, [key]: 'confirmed' }));
    push(path);
  }, [push]);

  const decline = useCallback((key: string) => {
    setDecisions((prev) => ({ ...prev, [key]: 'declined' }));
  }, []);

  return { decisions, getDecision: (key: string) => decisions[key], confirm, decline };
}
