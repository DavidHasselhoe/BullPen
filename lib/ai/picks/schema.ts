/**
 * Bull's Weekly Pick — model output schemas.
 *
 * One schema per model call (see lib/ai/picks/pipeline.ts):
 *   Stage 2 (diligence) → DiligenceSchema: advance/reject + news per screened name.
 *   Stage 3 (commit ×3) → ModelPickSchema: bull/bear per finalist, then the pick.
 *   Tie-break           → TiebreakSchema, only when the three commits disagree.
 * CandidateSchema is a screened ticker plus the reason it's on the list, the
 * shape the grounding step consumes.
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

// ─── Candidate (a screened ticker, the grounding step's input) ───────────────

export const CandidateSchema = z.object({
  symbol: z.preprocess(upper, z.string().regex(/^[A-Z][A-Z.-]{0,6}$/, 'not a plausible US ticker')),
  reason: z.string().min(10),
});

export type Candidate = z.infer<typeof CandidateSchema>;

// ─── Stage 2: due-diligence output ───────────────────────────────────────────

const DiligenceReviewSchema = z.object({
  symbol: z.preprocess(upper, z.string().min(1)),
  verdict: z.preprocess(lower, z.enum(['advance', 'reject'])),
  /** Recent news, and whether it supports or contradicts the factor picture. */
  news: z.string().min(10),
  redFlags: z.array(z.string()).max(6).default([]),
  /** A dated upcoming event, or null. */
  catalyst: z.string().nullable().optional(),
  /** Short tag for the investment theme, used to stop repeats across weeks. */
  theme: z.string().min(3).max(60),
});

export const DiligenceSchema = z.object({
  reviews: z.array(DiligenceReviewSchema).min(1).max(30),
});

export type DiligenceReview = z.infer<typeof DiligenceReviewSchema>;

// ─── Stage 3 tie-break ───────────────────────────────────────────────────────

export const TiebreakSchema = z.object({
  symbol: z.preprocess(upper, z.string().min(1)),
  reason: z.string().min(10),
});

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

const DebateSchema = z.object({
  symbol: z.preprocess(upper, z.string().min(1)),
  bull: z.string().min(20),
  bear: z.string().min(20),
});

export const ModelPickSchema = z.object({
  /** The steelman bull and bear case for each finalist, argued before choosing. */
  debate: z.array(DebateSchema).min(2).max(8),
  symbol: z.preprocess(upper, z.string().min(1)),
  theme: z.string().min(3).max(40),
  // Caps are stated verbatim in COMMIT_SYSTEM_PROMPT — keep the two in sync, or
  // a run costs two Claude calls and publishes nothing.
  headline: z.string().min(8).max(110),
  oneLiner: z.string().min(20).max(320),
  catalystType: CatalystTypeEnum,
  conviction: z.coerce.number().int().min(1).max(5),
  convictionReason: z.string().min(10).max(240),
  horizon: HorizonEnum,
  thesis: z.object({
    sections: z.array(ThesisSectionSchema).min(2).max(5),
    evidence: z.array(EvidenceRowSchema).min(2).max(8),
  }),
  /** What would prove this wrong. At least two — a thesis with no falsifier isn't one. */
  risks: z.array(RiskSchema).min(2).max(5),
  /** Plain-language statement of what must happen for the thesis to work. */
  invalidation: z.string().min(20),
  /** What a reader should be able to see by the end of this quarter. */
  quarterCheckpoint: z.string().min(20).max(200),
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
  /** v2 picks (2026-Q4 on). Absent on earlier rows. */
  theme?: string;
  quarterCheckpoint?: string;
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

/** Parse + validate the due-diligence verdicts. Throws on failure. */
export function parseDiligence(raw: string): DiligenceReview[] {
  const parsed = parseJsonLoose(raw, 'diligence');
  const result = DiligenceSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`diligence: schema validation failed — ${formatIssues(result.error)}`);
  }
  return result.data.reviews;
}

/** Parse + validate a tie-break decision. Throws on failure. */
export function parseTiebreak(raw: string): z.infer<typeof TiebreakSchema> {
  const parsed = parseJsonLoose(raw, 'tiebreak');
  const result = TiebreakSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`tiebreak: schema validation failed — ${formatIssues(result.error)}`);
  }
  return result.data;
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
