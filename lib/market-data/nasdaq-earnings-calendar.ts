/**
 * Free, public Nasdaq earnings-calendar JSON API — no key, no auth.
 *
 * WHY THIS EXISTS: TwelveData's own `/earnings_calendar` only publishes
 * confirmed dates ~3-6 weeks out (see calendarDayTtl's comment in
 * calendar-days.ts), which leaves near-term days looking artificially quiet.
 * Verified live 2026-08-25: TD returned 0-2 US rows/day for the next 6 weeks
 * — even known quarterly reporters like FDX and NKE had no forward date
 * anywhere in TD's data — while this endpoint returned 50+ rows for the same
 * near-term days, including megacaps (NVDA, CRWD, CRM) with real EPS
 * estimates and BMO/AMC timing. calendar-days.ts merges this in for
 * near-term days to fill exactly that gap; see NASDAQ_MERGE_DAYS_AHEAD there.
 *
 * This module was originally instagram-pipeline-only (see git history /
 * lib/instagram/content/nasdaq-earnings-calendar.ts, which is now a thin
 * wrapper over fetchNasdaqEarningsDay below) — promoted to lib/market-data
 * once the Market Calendar needed the same near-term fill TD can't provide.
 *
 * Also unofficial: this is Nasdaq's own internal API backing their public
 * earnings calendar page, not a documented/licensed developer product — it
 * could change shape or start blocking scraping without notice. Fails soft
 * (a request error or empty day just yields no hits, same as a genuinely
 * quiet day) rather than throwing, so a format change degrades gracefully.
 *
 * PAST-DATE BONUS (verified live 2026-08-22): the same endpoint, queried for
 * a date that already happened, returns `eps` (actual) and `surprise` (%)
 * alongside `epsForecast` — the original estimate and the real result in one
 * response.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface NasdaqEarningsRow {
  symbol: string;
  name?: string;
  time: 'BMO' | 'AMC' | null;
  /** Consensus/analyst EPS estimate in dollars (e.g. 1.25, or -0.30 for an
   *  expected loss). Null if unconfirmed. */
  epsEstimate: number | null;
  /** Actual reported EPS — only present once a report has happened. */
  epsActual: number | null;
  /** eps vs epsForecast surprise, as a percent — same past-date-only
   *  availability as epsActual. */
  surprisePercent: number | null;
}

function parseTime(raw: string | undefined): 'BMO' | 'AMC' | null {
  if (raw === 'time-pre-market') return 'BMO';
  if (raw === 'time-after-hours') return 'AMC';
  return null;
}

/** "$4.71" -> 4.71, "($0.45)" -> -0.45, "" -> null. */
function parseEps(raw: string | undefined): number | null {
  if (!raw) return null;
  const negative = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/[()$,]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** "3.6" -> 3.6, "-4.2" -> -4.2, "" -> null. */
function parseSurprise(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

interface NasdaqCalendarRow {
  symbol?: string;
  name?: string;
  time?: string;
  epsForecast?: string;
  eps?: string;
  surprise?: string;
}

interface NasdaqCalendarResponse {
  data?: { rows?: NasdaqCalendarRow[] | null } | null;
}

/** All rows for one date, unfiltered (global — every exchange, every market
 *  cap). Callers filter to whatever universe/allowlist they care about. */
export async function fetchNasdaqEarningsDay(date: string): Promise<NasdaqEarningsRow[]> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as NasdaqCalendarResponse;
    const rows = body.data?.rows ?? [];
    return rows
      .filter((r): r is NasdaqCalendarRow & { symbol: string } => !!r.symbol)
      .map((r) => ({
        symbol: r.symbol.toUpperCase(),
        name: r.name,
        time: parseTime(r.time),
        epsEstimate: parseEps(r.epsForecast),
        epsActual: parseEps(r.eps),
        surprisePercent: parseSurprise(r.surprise),
      }));
  } catch (err) {
    console.error(`[nasdaq-earnings-calendar] fetch failed for ${date}:`, err);
    return [];
  }
}
