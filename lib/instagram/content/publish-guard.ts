/**
 * Last check before a staged post goes out to Instagram.
 *
 * This exists because the pipeline lost its human. Every content type here was
 * built as "stage it, a person reviews the Discord preview, a person publishes
 * it", and the null-when-not-found convention in the content builders is safe
 * under that model: a missing figure renders as an N/A state and the reviewer
 * decides whether it's still worth posting. Auto-publish replaced the reviewer
 * without replacing the judgement, so nothing stood between an incomplete
 * report and a public post.
 *
 * It cost us one: ORCL and ADBE went out on 2026-09-10 with every consensus
 * field null, so the EPS card was a bare number with nothing to compare it to
 * and the caption filled the gap by claiming EPS "came in ahead of last year's
 * pace", a comparison nothing in the data supports. The four deep dives before
 * them (NVDA, MRVL, DELL, AVGO) all carried real estimates and a computed
 * beat/miss, so this bar is one the pipeline has already cleared repeatedly,
 * not a new standard invented after the fact.
 *
 * Blocking leaves the row 'ready' rather than marking it failed. The data may
 * be fixable, and a person can still publish deliberately once it is.
 */

import type { InstagramPostSlides } from './schema';

export type PublishGuardResult =
  | { ok: true }
  | { ok: false; problems: string[] };

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * A deep dive's whole promise is "here's how the quarter landed against what
 * analysts expected". Without the estimates there is no beat/miss to show, the
 * comparison cards render bare, and the caption writer is left inventing
 * context. Actuals alone are not a publishable version of this format.
 */
function checkEarningsDeepDive(data: Record<string, unknown>): string[] {
  const problems: string[] = [];

  if (!isNum(data.epsActual)) problems.push('no EPS actual was extracted from the filing');
  if (!isNum(data.revenueActual)) problems.push('no revenue actual was extracted from the filing');

  // Status fields are derived (estimate + actual), so a null here means either
  // half is missing. Naming the estimate is the more useful message: that is
  // the half that actually goes missing in practice.
  if (data.epsStatus == null) problems.push('no EPS beat/miss: the consensus EPS estimate is missing');
  if (data.revenueStatus == null) problems.push('no revenue beat/miss: the consensus revenue estimate is missing');

  if (typeof data.headline !== 'string' || !data.headline.trim()) problems.push('headline is empty');
  if (typeof data.caption !== 'string' || !data.caption.trim()) problems.push('caption is empty');

  return problems;
}

/**
 * Checks a staged post is complete enough to publish unattended.
 *
 * Only earnings_deep_dive is gated for now. The other three types are built
 * from a whole list of companies rather than one company's filing, so a single
 * missing figure degrades a row instead of hollowing out the entire post, and
 * none of them has produced a bad post to date. Add them here if that changes,
 * rather than pre-emptively.
 */
export function checkPublishable(slides: InstagramPostSlides): PublishGuardResult {
  if (slides.contentType !== 'earnings_deep_dive') return { ok: true };

  const problems = checkEarningsDeepDive(slides.data as unknown as Record<string, unknown>);
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
