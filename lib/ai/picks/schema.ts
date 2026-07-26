/**
 * Bull's Weekly Pick — model output schemas.
 *
 * Two model calls, two schemas:
 *   Stage 1 (scout)  → CandidateListSchema: 6–10 tickers + a one-line narrative each.
 *   Stage 3 (commit) → ModelPickSchema: the final pick with a structured thesis.
 *
 * Both are validated with zod before anything touches the database. A pick that
 * fails validation is never published — a missing week is honest, a malformed
 * or hallucinated pick isn't.
 */

import { z } from 'zod';
import { stripFences, extractJsonObject } from '@/lib/ai/portfolio-builder/schema';

const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v);
const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v);

export const CatalystTypeEnum = z.preprocess(
  lower,
  z.enum(['undervalued', 'catalyst', 'growth', 'turnaround', 'thematic'])
);
export const HorizonEnum = z.preprocess(lower, z.enum(['3m', '6m', '12m']));
export const SeverityEnum = z.preprocess(lower, z.enum(['low', 'medium', 'high']));

export type CatalystType = z.infer<typeof CatalystTypeEnum>;
export type Horizon = z.infer<typeof HorizonEnum>;

export const CATALYST_LABELS: Record<CatalystType, string> = {
  undervalued: 'Undervalued',
  catalyst: 'Near-term catalyst',
  growth: 'Growth story',
  turnaround: 'Turnaround',
  thematic: 'Thematic',
};

export const HORIZON_LABELS: Record<Horizon, string> = {
  '3m': 'Next 3 months',
  '6m': 'Next 6 months',
  '12m': 'Next 12 months',
};

// ─── Stage 1: scout output ───────────────────────────────────────────────────

export const CandidateSchema = z.object({
  symbol: z.preprocess(upper, z.string().regex(/^[A-Z][A-Z.-]{0,6}$/, 'not a plausible US ticker')),
  reason: z.string().min(10),
});

export const CandidateListSchema = z.object({
  candidates: z.array(CandidateSchema).min(1).max(12),
});

export type Candidate = z.infer<typeof CandidateSchema>;

// ─── Stage 3: final pick output ──────────────────────────────────────────────

/**
 * Thesis sections. Deliberately narrower than the deep-dive block union — a
 * weekly pick is an argument, not a report, so it renders as titled prose plus
 * an evidence table rather than a dozen chart types.
 */
const ThesisSectionSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(40),
});

const EvidenceRowSchema = z.object({
  label: z.string().min(2),
  value: z.string().min(1),
  /** How this compares to the peer group, e.g. "vs 28.4 industry median". */
  context: z.string().optional(),
});

const RiskSchema = z.object({
  title: z.string().min(3),
  detail: z.string().min(20),
  severity: SeverityEnum,
});

export const ModelPickSchema = z.object({
  symbol: z.preprocess(upper, z.string().min(1)),
  // Caps are stated verbatim in COMMIT_SYSTEM_PROMPT — keep the two in sync, or
  // a run costs two Claude calls and publishes nothing.
  headline: z.string().min(8).max(110),
  oneLiner: z.string().min(20).max(320),
  catalystType: CatalystTypeEnum,
  conviction: z.coerce.number().int().min(1).max(5),
  horizon: HorizonEnum,
  thesis: z.object({
    sections: z.array(ThesisSectionSchema).min(2).max(5),
    evidence: z.array(EvidenceRowSchema).min(2).max(8),
  }),
  /** What would prove this wrong. At least two — a thesis with no falsifier isn't one. */
  risks: z.array(RiskSchema).min(2).max(5),
  /** Plain-language statement of what must happen for the thesis to work. */
  invalidation: z.string().min(20),
});

export type ModelPick = z.infer<typeof ModelPickSchema>;
export type ThesisSection = z.infer<typeof ThesisSectionSchema>;
export type EvidenceRow = z.infer<typeof EvidenceRowSchema>;
export type PickRisk = z.infer<typeof RiskSchema>;

/** The `thesis` JSONB column shape. */
export interface StoredThesis {
  sections: ThesisSection[];
  evidence: EvidenceRow[];
  invalidation: string;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function parseJsonLoose(raw: string, label: string): unknown {
  if (!raw || raw.trim().length === 0) {
    throw new Error(`${label}: model returned empty response`);
  }
  const stripped = stripFences(raw);
  try {
    return JSON.parse(stripped);
  } catch {
    try {
      return JSON.parse(extractJsonObject(stripped));
    } catch (innerErr) {
      throw new Error(`${label}: JSON parse failed. Raw (first 300): ${stripped.slice(0, 300)}. ${innerErr}`);
    }
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
}

/** Parse + validate the scout's candidate list. Throws on failure. */
export function parseCandidateList(raw: string): Candidate[] {
  const parsed = parseJsonLoose(raw, 'scout');
  const result = CandidateListSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`scout: schema validation failed — ${formatIssues(result.error)}`);
  }
  // De-dupe by symbol, preserving the model's ordering.
  const seen = new Set<string>();
  return result.data.candidates.filter((c) => {
    if (seen.has(c.symbol)) return false;
    seen.add(c.symbol);
    return true;
  });
}

/** Parse + validate the final pick. Throws on failure. */
export function parseModelPick(raw: string): ModelPick {
  const parsed = parseJsonLoose(raw, 'commit');
  const result = ModelPickSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`commit: schema validation failed — ${formatIssues(result.error)}`);
  }
  return result.data;
}
