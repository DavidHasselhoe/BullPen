# Changelog Activity Heatmap — Design

**Goal:** Add a GitHub-style contribution heatmap to the public `/changelog` page, showing real commit activity on the `preview` branch since launch, so visitors can see how actively BullPen is being developed.

## Motivation

The changelog page currently lists dated entries but gives no sense of *pace*. A visual activity heatmap (à la GitHub's contribution graph) communicates momentum at a glance — a "proof of life" signal for a solo/small-team product where visitors may wonder if it's actively maintained.

## Data source

Real git commit history on the `preview` branch, fetched from the public GitHub repo (`github.com/DavidHasselhoe/BullPen`) via GitHub's REST API — not the changelog entries themselves (too sparse: ~15-20 unique days vs. hundreds of commit-days) and not synthetic/fake data (dishonest).

- Endpoint: `GET https://api.github.com/repos/DavidHasselhoe/BullPen/commits?sha=preview&since=2026-01-08T00:00:00Z&per_page=100&page=N`, paginated until a page returns fewer than 100 results.
- No auth token required — the repo is public. Unauthenticated rate limit is 60 req/hour, which comfortably covers this fetch running at most once per revalidation window (see Caching below).
- `since` = the project's first commit date, hardcoded as the constant `LAUNCH_DATE = '2026-01-08'` (ISO date, no time) and expanded to `${LAUNCH_DATE}T00:00:00Z` for the API query — it never changes and avoids an extra API call to find it.

## Caching & failure handling

- Fetched via Next.js's `fetch()` with `{ next: { revalidate: 86400 } }` (24h) — runs at most once a day server-side regardless of page traffic.
- On any failure (network error, non-200, rate limit, malformed response): catch and return `null` from the data-fetching function. The page renders without the heatmap section entirely — no error state, no broken layout. This is decorative, not core content.
- No client-side fetching, no loading spinner — this stays a server-rendered section like the rest of the page.

## Aggregation

New module `lib/github/commit-activity.ts`:

```ts
export interface DayActivity {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface ActivityHeatmapData {
  days: DayActivity[]; // every calendar day from launch to today, zero-filled
  totalCommits: number;
  launchDate: string; // YYYY-MM-DD
}

export async function getCommitActivity(): Promise<ActivityHeatmapData | null>
```

- Fetch all commit pages, extract `commit.author.date` (ISO 8601 UTC) from each, bucket into a `Map<string, number>` keyed by the UTC date portion (`date.slice(0, 10)`).
- Build a dense `days[]` array covering every calendar date from `launchDate` to today (inclusive), filling zero for days with no commits — this is what makes the grid layout possible (see Visual design).
- `totalCommits` = sum of all counts, used for the headline stat.

## Visual design

New component `components/changelog/ActivityHeatmap.tsx` (server component, pure — data in via props, no fetching inside it):

- **Layout**: weeks as columns, Sun→Sat as rows (7), matching the reference screenshot. First column may be a partial week (launch date isn't necessarily a Sunday) — pad with empty/transparent cells, not zero-count cells, so it's visually distinct from "zero commits that day."
- **Color tiers**: 5 levels on a single-hue Signal Emerald scale (`emerald-500` at increasing opacity: 0%/25%/45%/70%/100%), thresholds `0 / 1-2 / 3-5 / 6-12 / 13+` chosen against the actual distribution (observed range 0–37 commits/day). Never red — red is reserved for losses per `DESIGN.md`'s One Signal Rule. Empty cells (tier 0) render as a faint bordered square using existing border tokens, not a dark fill, to stay correct in both light and dark theme.
- **Labels**: month labels along the top (first column of each new month), day-of-week labels (Mon/Wed/Fri only, like GitHub) along the left.
- **Headline stat** above the grid: "**{totalCommits} commits shipped since launch**" — plain text, no icon needed.
- **Tooltip**: native `title` attribute per cell (`"14 commits on July 9, 2026"` / `"No commits on..."`) — zero JS, keeps the whole section server-rendered.
- **Mobile**: grid sits in an `overflow-x-auto` container so it scrolls horizontally on narrow viewports instead of squeezing; headline stat and labels stay outside the scroll container.
- **Legend**: small "Less → More" swatch row under the grid, right-aligned, mirroring the reference screenshot — reuses the same 5 color tiers.

## Placement

`app/changelog/page.tsx` becomes an `async function` (Next.js App Router supports async server components natively — no new pattern needed). Section is inserted directly below the existing intro paragraph ("What's new, improved, and fixed in BullPen.") and above the date-grouped entries list. If `getCommitActivity()` returns `null`, this section is simply omitted — the rest of the page is unaffected.

## Out of scope (YAGNI)

- No year selector / multi-year view — project is 6 months old, "since launch" is the only range that makes sense right now. Revisit if BullPen is still shipping in a year.
- No client-side interactivity beyond the native tooltip — no custom hover card, no click-to-filter.
- No `main`-branch or all-branches aggregation — `preview` is where all day-to-day work happens per the branch strategy in `CLAUDE.md`; `main` only gets merge commits at session end, which would make the graph look artificially sparse.
- No GitHub auth token — unauthenticated public API access is sufficient at this traffic/revalidation cadence.

## Testing

- No unit test framework in this repo (per `CLAUDE.md`) — verify via `npm run dev` + manual browser check on `/changelog`, both light and dark theme, and a throttled/narrow (375px) viewport to confirm the horizontal-scroll fallback.
- Manually verify the "no commits found" / API-failure path by temporarily pointing the fetch at a bad URL, confirming the page still renders cleanly with the section omitted, then reverting.
- `npm run lint` before commit.

## Critical files

- `lib/github/commit-activity.ts` (new) — fetch + aggregation
- `components/changelog/ActivityHeatmap.tsx` (new) — pure display component
- `app/changelog/page.tsx` (modify — becomes async, inserts the new section)
