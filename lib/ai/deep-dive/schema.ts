/**
 * AI Deep Dive — report schema.
 *
 * The model returns a single JSON object: { headline, verdict, blocks[] }.
 * We validate it with zod, then attach server-owned fields (ticker, companyName,
 * model, lens, generatedAt, dataAsOf) to form the stored/rendered DeepDiveReport.
 *
 * Block rendering is data-driven: each block has a `type` discriminator and a
 * dedicated renderer. Unknown/empty blocks are skipped by the renderer, so the
 * model has freedom over which blocks to include and in what order.
 */

import { z } from 'zod';
import { stripFences, extractJsonObject } from '@/lib/ai/portfolio-builder/schema';

// Case-insensitive enums — the model occasionally varies casing.
const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v);

export const ToneEnum = z.preprocess(lower, z.enum(['positive', 'negative', 'neutral']));
export const StanceEnum = z.preprocess(lower, z.enum(['bullish', 'neutral', 'bearish', 'mixed']));
export const ConfidenceEnum = z.preprocess(
  (v) => {
    const s = typeof v === 'string' ? v.toLowerCase() : v;
    return s === 'med' ? 'medium' : s;
  },
  z.enum(['low', 'medium', 'high'])
);
export const SeverityEnum = z.preprocess(lower, z.enum(['low', 'medium', 'high']));
export const DirectionEnum = z.preprocess(lower, z.enum(['up', 'down', 'neutral']));

// ─── Block schemas ──────────────────────────────────────────────────────────

const KpiGridBlock = z.object({
  type: z.literal('kpi_grid'),
  title: z.string().optional(),
  items: z.array(z.object({
    label: z.string(),
    value: z.string(),
    sublabel: z.string().optional(),
    tone: ToneEnum.optional(),
  })).min(1),
});

const BarChartBlock = z.object({
  type: z.literal('bar_chart'),
  title: z.string(),
  unit: z.string().optional(),          // e.g. "$B", "%"
  series: z.array(z.object({
    label: z.string(),                   // e.g. "FY2025", "Q2'27E"
    value: z.number(),
    projected: z.boolean().optional(),   // renders lighter — guidance/estimates
  })).min(2),
});

const SegmentBarsBlock = z.object({
  type: z.literal('segment_bars'),
  title: z.string(),
  items: z.array(z.object({
    label: z.string(),
    pct: z.number(),                     // 0–100
    value: z.string().optional(),
  })).min(1),
});

const KvTableBlock = z.object({
  type: z.literal('kv_table'),
  title: z.string(),
  rows: z.array(z.object({
    label: z.string(),
    value: z.string(),
    badge: z.object({ text: z.string(), tone: ToneEnum.optional() }).optional(),
  })).min(1),
});

const PriceTargetsBlock = z.object({
  type: z.literal('price_targets'),
  title: z.string().optional(),
  current: z.string().optional(),        // current price for context
  currentPrice: z.number().optional(),   // numeric twin of `current` — powers the range bar
  low: z.number().optional(),
  high: z.number().optional(),
  mean: z.number().optional(),
  items: z.array(z.object({
    source: z.string(),                  // e.g. "HSBC", "Consensus"
    value: z.string(),
    tone: ToneEnum.optional(),
  })).min(1),
});

const MetricTableBlock = z.object({
  type: z.literal('metric_table'),
  title: z.string(),
  rows: z.array(z.object({
    label: z.string(),
    value: z.string(),
    note: z.string().optional(),
    source: z.string().optional(),
  })).min(1),
});

// A bullet is either a plain string (legacy shape, still emitted freely by
// the model and how every already-saved report stores its bull/bear points)
// or a structured point carrying an optional source citation.
const BullBearPoint = z.union([
  z.string(),
  z.object({ text: z.string(), source: z.string().optional() }),
]);

const BullBearBlock = z.object({
  type: z.literal('bull_bear'),
  title: z.string().optional(),
  bull: z.array(BullBearPoint).min(1),
  bear: z.array(BullBearPoint).min(1),
});

const CatalystsBlock = z.object({
  type: z.literal('catalysts'),
  title: z.string().optional(),
  items: z.array(z.object({
    title: z.string(),
    detail: z.string().optional(),
    timeframe: z.string().optional(),
    direction: DirectionEnum.optional(),
    source: z.string().optional(),
  })).min(1),
});

const RisksBlock = z.object({
  type: z.literal('risks'),
  title: z.string().optional(),
  items: z.array(z.object({
    title: z.string(),
    detail: z.string().optional(),
    severity: SeverityEnum.optional(),
    source: z.string().optional(),
  })).min(1),
});

const ProseBlock = z.object({
  type: z.literal('prose'),
  title: z.string().optional(),
  markdown: z.string(),
});

export const BlockSchema = z.discriminatedUnion('type', [
  KpiGridBlock, BarChartBlock, SegmentBarsBlock, KvTableBlock, PriceTargetsBlock,
  MetricTableBlock, BullBearBlock, CatalystsBlock, RisksBlock, ProseBlock,
]);

export const VerdictSchema = z.object({
  stance: StanceEnum,
  confidence: ConfidenceEnum,
  oneLiner: z.string(),
});

/** What the model returns. */
export const ModelReportSchema = z.object({
  headline: z.string(),
  companyName: z.string().optional(),
  verdict: VerdictSchema,
  blocks: z.array(BlockSchema).min(1),
});

export type Block = z.infer<typeof BlockSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type ModelReport = z.infer<typeof ModelReportSchema>;
export type BullBearPoint = z.infer<typeof BullBearPoint>;

/** Stored/rendered report: model output + server-owned provenance fields. */
export interface DeepDiveReport extends ModelReport {
  ticker: string;
  companyName: string;
  lens: DeepDiveLens;
  model: string;
  generatedAt: string;   // ISO
  dataAsOf: string | null;
}

export type DeepDiveLens = 'full' | 'bull_bear' | 'valuation' | 'risk' | 'for_me';

export const LENS_LABELS: Record<DeepDiveLens, string> = {
  full: 'Full deep dive',
  bull_bear: 'Bull vs Bear',
  valuation: 'Valuation focus',
  risk: 'Risk check',
  for_me: 'Is it a buy for me?',
};

export function isLens(v: string): v is DeepDiveLens {
  return v === 'full' || v === 'bull_bear' || v === 'valuation' || v === 'risk' || v === 'for_me';
}

/** Parse + validate the model's JSON output. Throws a descriptive error on failure. */
export function parseModelReport(raw: string): ModelReport {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Model returned empty response');
  }

  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    try {
      parsed = JSON.parse(extractJsonObject(stripped));
    } catch (innerErr) {
      throw new Error(`JSON parse failed. Raw (first 300): ${stripped.slice(0, 300)}. ${innerErr}`);
    }
  }

  const result = ModelReportSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Schema validation failed — ${issues}`);
  }
  return result.data;
}
