import type { RevenueFact } from '@/lib/segments/edgar-facts';

/**
 * Which revenue breakdown to show, and whether to show one at all.
 *
 * Companies tag several at once and they disagree about what is interesting.
 * Apple's reportable segments are Americas, Europe and Greater China; the
 * split people mean when they ask what Apple sells lives on a different axis
 * entirely. So the axis is chosen by preference, never by which one happens
 * to add up.
 *
 * Geography is deliberately unreachable. "United States $581B, Non-US $132B"
 * reconciles perfectly and tells a reader nothing about the business.
 *
 * Pure, so `scripts/test-segment-selection.ts` can hold it to real filings
 * with no network.
 */

const PRODUCT_AXIS = 'ProductOrServiceAxis';
const SEGMENT_AXIS = 'StatementBusinessSegmentsAxis';
const CONSOLIDATION_AXIS = 'ConsolidationItemsAxis';
/** The member that marks a segment figure as a reportable segment's own total. */
const OPERATING_SEGMENTS = 'OperatingSegmentsMember';

const MIN_PARTS = 2;
const MAX_PARTS = 9;
/** Parts must account for the period's revenue this closely, or nothing is shown. */
const RECONCILE_TOLERANCE = 0.01;
/** A segment only expands into its products when they account for this much of it. */
const EXPANSION_TOLERANCE = 0.005;
/** A positive remainder smaller than this is noise, not a part worth drawing. */
const RESIDUAL_FLOOR = 0.001;

export interface RevenuePart {
  label: string;
  value: number;
}

export interface Breakdown {
  parts: RevenuePart[];
  basis: 'product' | 'segment';
  total: number;
}

export interface SelectOptions {
  /** The period's revenue, as the card already shows it. */
  consolidated: number;
  /** Only facts ending on this date are considered. */
  periodEnd: string;
  /** 365 for a year, 91 for a quarter. */
  periodDays: number;
}

export function cleanLabel(member: string): string {
  return member
    .replace(/Member$/, '')
    .replace(/Segment$/, '')
    // "HealthandWellness" and "WearablesHomeandAccessories" glue a lowercase
    // "and" between words, which camel splitting alone mangles into
    // "Healthand Wellness".
    .replace(/([a-z])and([A-Z])/g, '$1 and $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Camel case cannot know these three.
    .replace(/\bI Phone\b/, 'iPhone')
    .replace(/\bI Pad\b/, 'iPad')
    .replace(/\bYou Tube\b/, 'YouTube')
    // Every part here is revenue; saying so in the label is noise.
    .replace(/\s+Revenue$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drops any member equal to the sum of two or more of the others.
 *
 * Apple tags "Product" next to iPhone, Mac, iPad and Wearables, which sum to
 * exactly it, and "Service" sits between them in document order, so a scan of
 * consecutive runs misses it. NVIDIA tags "Data Center" over Compute and
 * Networking. Keeping both levels double counts revenue, which is how a first
 * pass produced a chart showing 258% of Alphabet's sales.
 *
 * An exact subset scan over at most 12 members is 4,096 comparisons, so the
 * brute force is both affordable and always right.
 */
function dropRollups(parts: RevenuePart[]): RevenuePart[] {
  if (parts.length > 12) return parts;

  const isRollup = (target: RevenuePart): boolean => {
    const pool = parts.filter((p) => p !== target);
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      let count = 0;
      let total = 0;
      for (let i = 0; i < pool.length; i++) {
        if (mask & (1 << i)) {
          count++;
          total += pool[i].value;
        }
      }
      if (count >= 2 && Math.abs(total - target.value) / target.value < EXPANSION_TOLERANCE) {
        return true;
      }
    }
    return false;
  };

  return parts.filter((p) => !isRollup(p));
}

/** One value per member, rollups removed, largest first. */
function toParts(facts: RevenueFact[], memberOf: (f: RevenueFact) => string): RevenuePart[] {
  const byMember = new Map<string, number>();
  for (const fact of facts) byMember.set(memberOf(fact), fact.value);
  const parts = [...byMember.entries()].map(([member, value]) => ({
    label: cleanLabel(member),
    value,
  }));
  return dropRollups(parts).sort((a, b) => b.value - a.value);
}

function gate(parts: RevenuePart[], basis: Breakdown['basis'], consolidated: number): Breakdown | null {
  if (parts.length < MIN_PARTS || parts.length > MAX_PARTS) return null;
  if (new Set(parts.map((p) => p.label)).size !== parts.length) return null;

  const total = parts.reduce((s, p) => s + p.value, 0);
  const residual = consolidated - total;
  if (Math.abs(residual) / consolidated > RECONCILE_TOLERANCE) return null;

  const final = [...parts];
  // A positive remainder is real revenue the filing did not attribute to a
  // named part, so it is drawn rather than hidden.
  if (residual / consolidated > RESIDUAL_FLOOR) final.push({ label: 'Other', value: residual });

  return { parts: final, basis, total: final.reduce((s, p) => s + p.value, 0) };
}

export function selectBreakdown(facts: RevenueFact[], opts: SelectOptions): Breakdown | null {
  const { consolidated, periodEnd, periodDays } = opts;
  if (!Number.isFinite(consolidated) || consolidated <= 0) return null;

  // Only this period's facts. Every 10-K carries three fiscal years at the
  // same ~365 day duration, so matching on duration alone reads a
  // comparative: Apple's iPhone came back as FY2024's $200.58B that way.
  const inPeriod = facts.filter(
    (f) => f.end === periodEnd && Math.abs(f.durationDays - periodDays) <= 20 && f.value > 0,
  );

  const byAxes = new Map<string, RevenueFact[]>();
  for (const fact of inPeriod) {
    const key = fact.members.map((m) => m.axis).sort().join('+');
    if (!byAxes.has(key)) byAxes.set(key, []);
    byAxes.get(key)!.push(fact);
  }
  const group = (...axes: string[]) => byAxes.get([...axes].sort().join('+')) ?? [];

  // 1. Products on their own axis: the split a reader recognises, with the
  //    plainest labels.
  const products = group(PRODUCT_AXIS);
  if (products.length >= MIN_PARTS) {
    const got = gate(toParts(products, (f) => f.members[0].member), 'product', consolidated);
    if (got) return got;
  }

  // 2. Reportable segments. Some filers tag these bare, others qualify them
  //    with ConsolidationItemsAxis; both mean the same thing.
  const bare = group(SEGMENT_AXIS);
  const qualified = group(CONSOLIDATION_AXIS, SEGMENT_AXIS).filter((f) =>
    f.members.some((m) => m.member === OPERATING_SEGMENTS),
  );
  const segments = bare.length >= MIN_PARTS ? bare : qualified;
  if (segments.length < MIN_PARTS) return null;

  const segmentMember = (f: RevenueFact) =>
    f.members.find((m) => m.axis === SEGMENT_AXIS)?.member ?? '';

  // 2a. Expand a segment into its product detail when that detail accounts
  //     for the whole segment. This is what turns Alphabet from three coarse
  //     buckets into Search, YouTube, Network, Subscriptions, Cloud and Other
  //     Bets. Segments with no product detail stay whole.
  // One entry per segment: filers tag the same segment total more than once
  // (Alphabet tags each of its three twice, in the revenue note and again in
  // the segment note), and iterating the raw facts emits every part twice.
  const segmentTotals = new Map<string, number>();
  for (const fact of segments) segmentTotals.set(segmentMember(fact), fact.value);

  const productsInSegment = group(PRODUCT_AXIS, SEGMENT_AXIS);
  if (productsInSegment.length >= MIN_PARTS) {
    const expanded: RevenuePart[] = [];
    for (const [segment, segmentValue] of segmentTotals) {
      const children = productsInSegment.filter((f) => segmentMember(f) === segment);
      const childParts =
        children.length >= MIN_PARTS
          ? toParts(children, (f) => f.members.find((m) => m.axis === PRODUCT_AXIS)?.member ?? '')
          : [];
      const childSum = childParts.reduce((s, p) => s + p.value, 0);
      const accountsForSegment =
        childParts.length >= MIN_PARTS &&
        Math.abs(childSum - segmentValue) / segmentValue < EXPANSION_TOLERANCE;

      if (accountsForSegment) expanded.push(...childParts);
      else expanded.push({ label: cleanLabel(segment), value: segmentValue });
    }
    // `gate` refuses duplicate labels, which is what stops Walmart: its
    // categories repeat across segments ("Grocery" under both Walmart US and
    // Sam's Club) and would collide as graph node ids.
    const got = gate(expanded.sort((a, b) => b.value - a.value), 'segment', consolidated);
    if (got) return got;
  }

  return gate(toParts(segments, segmentMember), 'segment', consolidated);
}
