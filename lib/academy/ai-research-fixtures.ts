/**
 * Seeded example answers for the Academy "Researching with AI" demo lesson.
 *
 * These are entirely fixed, illustrative examples — NOT a live AI generation.
 * A real "Why Today?" call is Pro-gated, costs Anthropic credits, is slow, and is
 * non-deterministic (it can even fail mid-lesson). A fixture keeps the lesson
 * instant, free, always-correct, and identical for every learner — the same
 * philosophy as demo-portfolio-fixtures.ts. The lesson ends with a "now try it
 * live" CTA that deep-links to the real feature.
 */

export interface AiResearchSource {
  /** Publisher / outlet name shown on the citation chip. */
  label: string;
  /** Display-only href (the demo doesn't navigate away). */
  url: string;
}

export interface AiResearchFixture {
  ticker: string;
  name: string;
  /** Illustrative last price + day move, hand-set (no market-data call). */
  price: number;
  changePercent: number;
  /** The example question the learner "asks". */
  question: string;
  /** One-line summary answer. */
  headline: string;
  /** The sourced catalysts behind the move. */
  catalysts: string[];
  /** Citations that make the answer verifiable — the teachable point of the lesson. */
  sources: AiResearchSource[];
}

const NVDA_WHY_TODAY: AiResearchFixture = {
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  price: 210.4,
  changePercent: 4.2,
  question: 'Why is NVDA up today?',
  headline: 'NVDA rose ~4% on fresh Blackwell demand signals and a Wall Street upgrade.',
  catalysts: [
    'A major cloud provider disclosed a larger-than-expected next-gen GPU order in its earnings call, read as a demand signal for Blackwell.',
    'Morgan Stanley raised its price target and reiterated an Overweight rating, citing data-center capex momentum.',
    'Sector-wide semiconductor strength lifted peers the same day, so part of the move is the group, not just NVDA.',
  ],
  sources: [
    { label: 'Company earnings call', url: 'https://example.com/cloud-provider-earnings' },
    { label: 'Morgan Stanley note', url: 'https://example.com/ms-nvda-upgrade' },
    { label: 'Reuters — chip sector', url: 'https://example.com/reuters-semis' },
  ],
};

const FIXTURES: Record<string, AiResearchFixture> = {
  'nvda-why-today': NVDA_WHY_TODAY,
};

export function getAiResearchFixture(fixtureId: string): AiResearchFixture {
  return FIXTURES[fixtureId] ?? NVDA_WHY_TODAY;
}
