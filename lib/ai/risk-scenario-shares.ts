/**
 * How much of the current book a what-if portfolio is sized as, in percent.
 *
 * Its own file, with no imports, because both sides need it: the dialog that
 * offers the sizes and the route that validates what comes back. Keeping one
 * list means a size can never be offered that the server would reject, and
 * lib/ai/risk-scenario.ts itself reaches the database, so a client component
 * cannot import the constant from there.
 */
export const SCENARIO_SHARES = [5, 10, 25] as const;
export type ScenarioShare = (typeof SCENARIO_SHARES)[number];

export function parseScenarioShare(input: unknown): ScenarioShare | null {
  const n = typeof input === 'number' ? input : Number(input);
  return (SCENARIO_SHARES as readonly number[]).includes(n) ? (n as ScenarioShare) : null;
}
