/**
 * What an earnings deep dive leads with: the facts most likely to have moved
 * the stock, worst news first, built only from figures already on the row.
 *
 * Why it exists: 9 of the 14 posts we headlined "beat" (Aug-Oct 2026) fell
 * the next day. META beat while capex outran its cash, MRVL beat while
 * guiding margins down. A beat is the default (about 4 in 5 S&P 500 companies
 * beat in a given quarter); what changed is the news.
 *
 * Pure, so the caption writer (earnings-deep-dive.ts) and the story slide
 * (render/slides.tsx) rank the same way: the slide's headline and the
 * caption's lead are always the same fact.
 */

import type { EarningsDeepDiveData } from './schema';

/** Within this band (percent), a result counts as "in line" rather than a
 *  beat or miss — real-world actuals essentially never land EXACTLY on
 *  consensus, so a strict equality check would make "in line" a state that
 *  never actually fires. */
const INLINE_BAND_PERCENT = 0.5;

export function statusFor(estimate: number | null, actual: number | null): 'beat' | 'missed' | 'inline' | null {
  if (estimate == null || actual == null || estimate === 0) return null;
  const diffPercent = ((actual - estimate) / Math.abs(estimate)) * 100;
  if (Math.abs(diffPercent) < INLINE_BAND_PERCENT) return 'inline';
  return diffPercent > 0 ? 'beat' : 'missed';
}

const pct = (v: number) => `${Math.round(Math.abs(v))}%`;

/** Median, not mean: META's -13%, +9%, +8% averages to a "usual 1% beat" that never happened. */
export function typicalSurprise(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Capex this small next to revenue (MRVL: $127M on $2.7B) is not what moves the stock, whatever its growth rate. */
export function capexShareOfRevenue(d: EarningsDeepDiveData): number | null {
  return d.capexActual != null && d.revenueActual ? (d.capexActual / d.revenueActual) * 100 : null;
}

/** Next-quarter revenue outlook vs consensus, with the same in-line band as
 *  EPS and revenue. Was `>=` here while the slide badge used the band: AVGO's
 *  midpoint sat exactly on consensus, the slide said in line, the caption above. */
export function guidanceVsConsensus(d: EarningsDeepDiveData): 'beat' | 'missed' | 'inline' | null {
  if (d.guidanceRevenueHigh == null) return null;
  const mid = d.guidanceRevenueLow != null ? (d.guidanceRevenueLow + d.guidanceRevenueHigh) / 2 : d.guidanceRevenueHigh;
  return statusFor(d.guidanceConsensus, mid);
}

export type StoryKind =
  | 'outlook' | 'capex' | 'growth' | 'margin' | 'guidance' | 'beat' | 'split';

export interface StoryPoint {
  kind: StoryKind;
  bad: boolean;
  /** Plain headline for the story slide, a few words. */
  title: string;
  /** One sentence with the figures; also what the caption writer is given. */
  text: string;
}

const STATUS_WORD = { beat: 'beat', missed: 'missed', inline: 'came in line' } as const;

export function buildStory(d: EarningsDeepDiveData): StoryPoint[] {
  const bad: StoryPoint[] = [];
  const good: StoryPoint[] = [];

  if (d.outlookDirection === 'lowered') bad.push({ kind: 'outlook', bad: true, title: 'Outlook cut', text: 'Cut its full-year outlook.' });
  if (d.outlookDirection === 'mixed') bad.push({ kind: 'outlook', bad: true, title: 'A mixed outlook', text: 'Raised part of its full-year outlook and lowered another part.' });

  const capexShare = capexShareOfRevenue(d);
  if (d.capexActual != null && d.capexPriorYear != null && d.capexPriorYear > 0 && capexShare != null && capexShare >= 10) {
    const growth = (d.capexActual / d.capexPriorYear - 1) * 100;
    const fcf = d.secondaryMetricLabel === 'Free Cash Flow' ? d.secondaryMetricValue : null;
    if (growth >= 25 && fcf != null && fcf < 0) {
      bad.push({ kind: 'capex', bad: true, title: 'Spending outran cash', text: `Capital spending rose ${pct(growth)} from a year ago, more than the cash the business brought in.` });
    } else if (growth >= 25) {
      bad.push({ kind: 'capex', bad: true, title: 'Spending jumped', text: `Capital spending rose ${pct(growth)} from a year ago.` });
    }
  }

  const lastGrowth = d.revenueGrowthHistory?.length ? d.revenueGrowthHistory[d.revenueGrowthHistory.length - 1].yoyPercent : null;
  if (d.revenueYoyGrowthPercent != null && lastGrowth != null) {
    const diff = d.revenueYoyGrowthPercent - lastGrowth;
    if (diff <= -3) bad.push({ kind: 'growth', bad: true, title: 'Growth slowed', text: `Revenue growth slowed to ${pct(d.revenueYoyGrowthPercent)} from ${pct(lastGrowth)} the quarter before.` });
    if (diff >= 3) good.push({ kind: 'growth', bad: false, title: 'Growth sped up', text: `Revenue growth sped up to ${pct(d.revenueYoyGrowthPercent)} from ${pct(lastGrowth)} the quarter before.` });
  }

  if (d.grossMarginGuidancePercent != null && d.grossMarginActualPercent != null) {
    const diff = d.grossMarginGuidancePercent - d.grossMarginActualPercent;
    const now = `${d.grossMarginActualPercent.toFixed(1)}%`;
    const next = `${d.grossMarginGuidancePercent.toFixed(1)}%`;
    if (diff <= -0.5) bad.push({ kind: 'margin', bad: true, title: 'Margins expected to slip', text: `Expects next quarter's gross margin to slip to ${next} from ${now}.` });
    if (diff >= 0.5) good.push({ kind: 'margin', bad: false, title: 'Margins expected to rise', text: `Expects next quarter's gross margin to rise to ${next} from ${now}.` });
  }

  const guide = guidanceVsConsensus(d);
  if (guide === 'missed') bad.push({ kind: 'guidance', bad: true, title: 'A soft outlook', text: "Next quarter's revenue outlook came in below what analysts expected." });
  if (guide === 'beat') good.push({ kind: 'guidance', bad: false, title: 'A strong outlook', text: "Next quarter's revenue outlook came in above what analysts expected." });

  if (d.epsStatus === 'beat' && d.epsSurprisePercent != null && d.epsSurpriseHistory?.length) {
    const usual = typicalSurprise(d.epsSurpriseHistory);
    if (usual >= 4 && d.epsSurprisePercent < usual / 2) {
      bad.push({ kind: 'beat', bad: true, title: 'A smaller beat than usual', text: `Profit per share beat the forecast by ${pct(d.epsSurprisePercent)}, smaller than its usual ${pct(usual)} beat.` });
    }
    if (usual > 0 && d.epsSurprisePercent >= usual * 1.5 && d.epsSurprisePercent - usual >= 3) {
      good.push({ kind: 'beat', bad: false, title: 'A bigger beat than usual', text: `Profit per share beat the forecast by ${pct(d.epsSurprisePercent)}, bigger than its usual ${pct(usual)} beat.` });
    }
  }

  if (d.epsStatus && d.revenueStatus && d.epsStatus !== d.revenueStatus) {
    bad.push({
      kind: 'split', bad: true,
      title: `Profit ${STATUS_WORD[d.epsStatus]}, revenue ${STATUS_WORD[d.revenueStatus]}`.replace('came in line', 'in line'),
      text: `Profit per share ${STATUS_WORD[d.epsStatus]} the forecast but revenue ${STATUS_WORD[d.revenueStatus]}.`.replace(' came in line the forecast', ' came in line with the forecast'),
    });
  }

  if (d.outlookDirection === 'raised') good.push({ kind: 'outlook', bad: false, title: 'Outlook raised', text: 'Raised its full-year outlook.' });
  if (d.outlookDirection === 'initiated') good.push({ kind: 'outlook', bad: false, title: 'A first full-year outlook', text: 'Gave its first full-year outlook.' });

  return [...bad, ...good];
}

export function buildStoryPoints(d: EarningsDeepDiveData): string[] {
  return buildStory(d).map((p) => p.text);
}
