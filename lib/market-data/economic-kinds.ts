/**
 * The curated set of US economic releases BullPen tracks, and everything
 * static about each one: where to read it, where to watch it, and which
 * Academy lesson explains it. Client-safe (no server imports) because the
 * calendar UI and the notification list both render from it.
 *
 * Curated on purpose: BLS alone publishes ~300 releases a year. These eight
 * are the ones that reliably move the whole market; everything else would
 * bury them (DESIGN.md: terminal density is the anti-reference).
 */

export type EconomicKind = 'jobs' | 'cpi' | 'ppi' | 'jolts' | 'claims' | 'fomc' | 'gdp' | 'pce';

export interface EconomicKindMeta {
  kind: EconomicKind;
  /** English name for server-written text (notifications, the Daily Brief prompt).
   *  The UI translates via the tools namespace's economicName_<kind> instead. */
  name: string;
  /** Where the release itself is published. Canonical "latest release" URLs,
   *  so the link is right on the day without knowing the release's own path. */
  sourceUrl: string;
  sourceName: string;
  /** Live video, where the release has one (only the Fed's press conference). */
  watchUrl?: string;
  /** Free Academy lesson that explains this kind of release. Must stay free:
   *  it is the link a beginner follows from the calendar. */
  lessonHref: string;
  /** Optional Pro lesson for going further, shown with a Pro label to free users. */
  deeperLessonHref?: string;
}

/** macro-basics is free; macro-mechanics requires Pro (academy_courses.requires_pro, checked 2026-09-24). */
export const BIG_FOUR_LESSON = '/academy/macro-basics/the-big-four-macro-forces';
export const RATES_LESSON = '/academy/macro-mechanics/discount-rate-growth-vs-value';
const BIG_FOUR = BIG_FOUR_LESSON;
const RATES = RATES_LESSON;

export const ECONOMIC_KINDS: Record<EconomicKind, EconomicKindMeta> = {
  jobs: { kind: 'jobs', name: 'Jobs report', sourceUrl: 'https://www.bls.gov/news.release/empsit.nr0.htm', sourceName: 'BLS', lessonHref: BIG_FOUR },
  cpi: { kind: 'cpi', name: 'CPI inflation', sourceUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm', sourceName: 'BLS', lessonHref: BIG_FOUR, deeperLessonHref: RATES },
  ppi: { kind: 'ppi', name: 'PPI (producer prices)', sourceUrl: 'https://www.bls.gov/news.release/ppi.nr0.htm', sourceName: 'BLS', lessonHref: BIG_FOUR },
  jolts: { kind: 'jolts', name: 'Job openings (JOLTS)', sourceUrl: 'https://www.bls.gov/news.release/jolts.nr0.htm', sourceName: 'BLS', lessonHref: BIG_FOUR },
  claims: { kind: 'claims', name: 'Jobless claims', sourceUrl: 'https://www.dol.gov/ui/data.pdf', sourceName: 'U.S. Department of Labor', lessonHref: BIG_FOUR },
  fomc: {
    kind: 'fomc',
    name: 'Fed rate decision',
    sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases.htm',
    sourceName: 'Federal Reserve',
    watchUrl: 'https://www.youtube.com/@federalreserve',
    lessonHref: BIG_FOUR,
    deeperLessonHref: RATES,
  },
  gdp: { kind: 'gdp', name: 'GDP', sourceUrl: 'https://www.bea.gov/data/gdp/gross-domestic-product', sourceName: 'BEA', lessonHref: BIG_FOUR },
  pce: { kind: 'pce', name: 'PCE inflation', sourceUrl: 'https://www.bea.gov/data/income-saving/personal-income', sourceName: 'BEA', lessonHref: BIG_FOUR, deeperLessonHref: RATES },
};

/** One scheduled release, as the API and notifications carry it. */
export interface EconomicEvent {
  id: string;
  kind: EconomicKind;
  /** YYYY-MM-DD in US Eastern time. */
  date: string;
  /** ISO instant. Render in the viewer's own time zone. */
  release_at: string;
  detail: string | null;
  has_projections: boolean;
}

/** "8:30 AM" style time in `timeZone` (the viewer's own when omitted). */
export function fmtReleaseTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

/** Chip-sized: "4 PM" on the hour, "2:30 PM" otherwise, in the viewer's zone. */
export function fmtReleaseTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', d.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' });
}

/** The same instant as the viewer sees it, with their zone name ("2:30 PM GMT+2"). */
export function fmtReleaseTimeWithZone(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

/** True when the viewer is not on US Eastern time, so an "ET" reference helps. */
export function viewerIsOutsideET(iso: string): boolean {
  return fmtReleaseTime(iso) !== fmtReleaseTime(iso, 'America/New_York');
}
