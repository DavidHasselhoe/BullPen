/**
 * Prompt-injection boundary guard.
 *
 * Tools that fetch attacker-reachable external content (web search, news,
 * arbitrary URLs) must never be registered in the same agent as tools that
 * take a real side-effecting action (creating alerts, mutating holdings) —
 * otherwise a manipulated webpage could instruct the model to fire a
 * mutation the user never asked for, since BullpenChat.tsx auto-executes
 * tool calls with no confirmation step.
 *
 * Today that separation holds by construction: runAgent (lib/ai/agent.ts)
 * registers BULLPEN_TOOLS + createAlert + getPortfolioContext, none of which
 * fetch external content; the AI routes that DO get web search (Why Today?,
 * Deep Dive) register no mutating tools. This assertion turns that boundary
 * into an enforced invariant instead of a convention that silently breaks
 * the next time someone adds a tool to either side.
 */
const MUTATING_TOOL_NAMES = ['createAlert', 'addHolding', 'updateHolding', 'removeHolding'] as const;
const EXTERNAL_CONTENT_TOOL_NAMES = ['webSearch', 'web_search', 'fetchNews', 'fetchUrl', 'browsePage'] as const;

export function assertNoMutatingToolsWithExternalContent(toolNames: string[]): void {
  const hasMutating = toolNames.some((n) => (MUTATING_TOOL_NAMES as readonly string[]).includes(n));
  const hasExternal = toolNames.some((n) => (EXTERNAL_CONTENT_TOOL_NAMES as readonly string[]).includes(n));
  if (hasMutating && hasExternal) {
    throw new Error(
      `Prompt-injection boundary violated: this agent registers both a mutating tool and an external-content tool (${toolNames.join(', ')}). A manipulated webpage could trigger a mutation with no user confirmation — see lib/ai/tool-boundary.ts.`
    );
  }
}
