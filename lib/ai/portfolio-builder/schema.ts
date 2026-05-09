import { z } from 'zod';

const RoleEnum = z.enum(['CORE', 'SECONDARY', 'HEDGE']);
const RiskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const HoldingSchema = z.object({
  ticker: z.string().min(1).max(10),
  company: z.string(),
  exchange: z.string(),
  sector: z.string(),
  subsector_exposure: z.array(z.string()),
  allocation_pct: z.number().int().min(1).max(50),
  role: RoleEnum,
  rationale: z.string(),
  thesis_exposure_score: z.number().min(1).max(10),
  key_risk: z.string(),
  risk_level: RiskLevelEnum,
});

export const RiskSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: RiskLevelEnum,
  affected_holdings: z.array(z.string()),
});

export const PortfolioSchema = z.object({
  theme_summary: z.string(),
  macro_thesis: z.string(),
  investment_horizon: z.string(),
  confidence_score: z.number().min(0).max(100),
  confidence_rationale: z.string(),
  subsectors: z.array(z.string()).min(3).max(10),
  holdings: z.array(HoldingSchema).min(3).max(15),
  key_risks: z.array(RiskSchema).min(3).max(8),
  bull_case: z.array(z.string()).min(2).max(5),
  bear_case: z.array(z.string()).min(2).max(5),
  diversification_analysis: z.string(),
  rebalance_trigger: z.string(),
});

export type Portfolio = z.infer<typeof PortfolioSchema>;
export type PortfolioHolding = z.infer<typeof HoldingSchema>;
export type PortfolioRisk = z.infer<typeof RiskSchema>;

/** Strip markdown fences that the model sometimes adds despite instructions. */
export function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
}

/** Find the first {...} JSON object in a blob — last-resort recovery if the model adds prose. */
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}

/** Parse + validate the model's output. Throws with the Zod issues on failure. */
export function parsePortfolio(raw: string): Portfolio {
  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    parsed = JSON.parse(extractJsonObject(stripped));
  }
  return PortfolioSchema.parse(parsed);
}
