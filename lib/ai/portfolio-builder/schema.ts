import { z } from 'zod';

// Case-insensitive enums — Claude models frequently output "Core" instead of "CORE" etc.
const toUpper = (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v);

const RoleEnum = z.preprocess(toUpper, z.enum(['CORE', 'SECONDARY', 'HEDGE']));
const RiskLevelEnum = z.preprocess(toUpper, z.enum(['LOW', 'MEDIUM', 'HIGH']));

export const HoldingSchema = z.object({
  ticker: z.string().min(1).max(20),
  company: z.string(),
  exchange: z.string().optional().default(''),
  sector: z.string(),
  subsector_exposure: z.array(z.string()),
  // No .max() — the system prompt governs sizing; .int() removed (model sometimes uses floats)
  allocation_pct: z.number().min(0.5),
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
  subsectors: z.array(z.string()).min(1),
  holdings: z.array(HoldingSchema).min(3),
  key_risks: z.array(RiskSchema).min(1),
  bull_case: z.array(z.string()).min(1),
  bear_case: z.array(z.string()).min(1),
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
  if (start === -1) return raw;
  // The first balanced object, skipping braces inside strings. Slicing to the
  // last '}' broke when the model kept writing after its JSON (seen on the
  // weekly pick 2026-09-28: a valid object followed by more text).
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  const end = raw.lastIndexOf('}');
  return end > start ? raw.slice(start, end + 1) : raw;
}

/** Parse + validate the model's output. Throws a descriptive error on failure. */
export function parsePortfolio(raw: string): Portfolio {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Model returned empty response');
  }

  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Try to extract JSON from prose-wrapped output
    const extracted = extractJsonObject(stripped);
    try {
      parsed = JSON.parse(extracted);
    } catch (innerErr) {
      throw new Error(
        `JSON parse failed. Raw (first 300 chars): ${stripped.slice(0, 300)}. Error: ${innerErr}`
      );
    }
  }

  const result = PortfolioSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Schema validation failed — ${issues}`);
  }
  return result.data;
}
