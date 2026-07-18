# Changelog Activity Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-style contribution heatmap to the public `/changelog` page showing real commit activity on the `preview` branch since launch.

**Architecture:** A server-only data module fetches and aggregates commit history from GitHub's public REST API (cached 24h via Next.js's `fetch` cache), a pure presentational component renders it as a Sun→Sat week grid, and the changelog page (already a server component reading a local JSON file) becomes `async` to fetch and pass the data through. No client JS, no new API route, no database involved.

**Tech Stack:** Next.js 16 App Router (async Server Component), native `fetch` with `next.revalidate`, plain CSS in the existing `components/landing/landing-styles.css` (this page does not use Tailwind — see Global Constraints).

## Global Constraints

- Data source: commits on the `preview` branch only (`sha=preview`), from the public repo `DavidHasselhoe/BullPen` — never `main` (which only gets merge commits at session end and would look artificially sparse) and never the changelog JSON file (too sparse, ~15-20 unique days).
- No GitHub auth token — the repo is public; unauthenticated rate limit (60 req/hr) is sufficient given the caching below.
- `since` filter: hardcoded constant `LAUNCH_DATE = '2026-01-08'` (the project's first commit), expanded to `${LAUNCH_DATE}T00:00:00Z` for the API query. Never computed dynamically.
- Range shown: "since launch" (2026-01-08 → today), **not** a rolling 12 months — the project is 6 months old, so a rolling year would show ~6 months of dead space.
- Caching: `fetch(url, { next: { revalidate: 86400 } })` (24h) on every GitHub API call.
- Failure handling: any fetch error, non-OK response, or malformed data → the data function returns `null` and the entire heatmap section is omitted from the page. No error UI, no loading spinner.
- Color scale: Signal Emerald only, using the existing `--accent` token (`oklch(0.72 0.17 152)`) at increasing opacity. Never red — red is reserved for losses per `DESIGN.md`'s One Signal Rule. 5 tiers by commit count: `0 / 1-2 / 3-5 / 6-12 / 13+`.
- This page (`app/changelog/page.tsx`) is scoped under `.bullpen-landing-root`, the marketing/landing design system, which is **dark-theme only** (see `components/landing/landing-styles.css:1-54`, "the only theme we ship publicly") and uses plain CSS classes + OKLCH custom properties, **not** Tailwind utility classes or `cn()`. All new styling must follow this same pattern, not the app's Tailwind/shadcn conventions used elsewhere in the codebase.
- Tooltip: native `title` attribute per cell only — no client component, no custom hover card.
- Placement: directly below the existing intro paragraph, above the date-grouped entries list, in `app/changelog/page.tsx`.
- Mobile: the grid sits in its own `overflow-x-auto` container so it scrolls horizontally on narrow viewports rather than squeezing.
- Accessibility: the grid container gets `role="img"` and a summarizing `aria-label` (matching the existing pure-viz-component convention in `components/viz/RangeBar.tsx`), in addition to the always-visible headline text stat — chart content must not depend on hover/color alone (WCAG, per `.agents/skills/ui-ux-pro-max/SKILL.md` §10 "Charts & Data").

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/github/commit-activity.ts` (new) | Fetches paginated commit history from the GitHub API, aggregates into a dense day-by-day count array. Zero UI concerns. |
| `components/changelog/ActivityHeatmap.tsx` (new) | Pure presentational component: takes `ActivityHeatmapData`, renders the week grid, headline stat, and legend. No fetching. |
| `components/landing/landing-styles.css` (modify) | New `.activity-heatmap*` rules appended after the existing `/* Changelog page */` section. |
| `app/changelog/page.tsx` (modify) | Becomes `async`; calls `getCommitActivity()`, renders `<ActivityHeatmap>` conditionally. |

---

### Task 1: Commit activity data module

**Files:**
- Create: `lib/github/commit-activity.ts`

**Interfaces:**
- Produces: `interface DayActivity { date: string; count: number }`, `interface ActivityHeatmapData { days: DayActivity[]; totalCommits: number; launchDate: string }`, `async function getCommitActivity(): Promise<ActivityHeatmapData | null>` — all consumed by Task 2's component and Task 3's page.

- [ ] **Step 1: Create `lib/github/commit-activity.ts`**

```ts
const REPO = 'DavidHasselhoe/BullPen';
const LAUNCH_DATE = '2026-01-08';
const PER_PAGE = 100;
const MAX_PAGES = 20; // safety cap — 447 commits today is 5 pages; 20 pages covers years of growth

export interface DayActivity {
  /** YYYY-MM-DD, UTC calendar date. */
  date: string;
  count: number;
}

export interface ActivityHeatmapData {
  /** Dense list covering every calendar day from launchDate to today, zero-filled. */
  days: DayActivity[];
  totalCommits: number;
  launchDate: string;
}

interface GitHubCommitResponse {
  commit: {
    author: {
      date: string; // ISO 8601 UTC, e.g. "2026-07-18T14:23:01Z"
    } | null;
  };
}

async function fetchCommitPage(page: number): Promise<GitHubCommitResponse[]> {
  const url = `https://api.github.com/repos/${REPO}/commits?sha=preview&since=${LAUNCH_DATE}T00:00:00Z&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bullpen-changelog-heatmap',
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}`);
  }
  return (await res.json()) as GitHubCommitResponse[];
}

function buildDenseDayList(counts: Map<string, number>): DayActivity[] {
  const days: DayActivity[] = [];
  const cursor = new Date(`${LAUNCH_DATE}T00:00:00Z`);
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  while (cursor.getTime() <= todayUTC.getTime()) {
    const dateStr = cursor.toISOString().slice(0, 10);
    days.push({ date: dateStr, count: counts.get(dateStr) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export async function getCommitActivity(): Promise<ActivityHeatmapData | null> {
  try {
    const counts = new Map<string, number>();
    let totalCommits = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const commits = await fetchCommitPage(page);
      if (commits.length === 0) break;

      for (const c of commits) {
        const isoDate = c.commit.author?.date;
        if (!isoDate) continue;
        const day = isoDate.slice(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
        totalCommits += 1;
      }

      if (commits.length < PER_PAGE) break;
    }

    if (totalCommits === 0) return null;

    return {
      days: buildDenseDayList(counts),
      totalCommits,
      launchDate: LAUNCH_DATE,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (same warning baseline as before this change — this file introduces no new lint surface beyond standard TypeScript).

- [ ] **Step 3: Verify the fetch logic manually**

Since there's no test framework in this repo, verify by temporarily adding a scratch script. Create `scripts/scratch-verify-commit-activity.ts`:

```ts
import { getCommitActivity } from '../lib/github/commit-activity';

getCommitActivity().then((data) => {
  if (!data) {
    console.log('getCommitActivity returned null');
    return;
  }
  console.log('totalCommits:', data.totalCommits);
  console.log('days.length:', data.days.length);
  console.log('first day:', data.days[0]);
  console.log('last day:', data.days[data.days.length - 1]);
  console.log('busiest day:', data.days.reduce((a, b) => (b.count > a.count ? b : a)));
});
```

Run: `npx tsx scripts/scratch-verify-commit-activity.ts`

Expected: `totalCommits` roughly matches `git log preview --oneline | wc -l` (447 at plan-writing time, will have grown), `days.length` equals the number of calendar days from 2026-01-08 to today, the busiest day shows a plausible high count (e.g. 2026-07-09 with 37). Then delete the scratch script — it's not part of the shipped codebase:

```bash
rm scripts/scratch-verify-commit-activity.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/github/commit-activity.ts
git commit -m "feat: add GitHub commit activity data module for changelog heatmap"
```

---

### Task 2: `ActivityHeatmap` component + styles

**Files:**
- Create: `components/changelog/ActivityHeatmap.tsx`
- Modify: `components/landing/landing-styles.css` (append after the existing changelog section, currently ending at line 594)

**Interfaces:**
- Consumes: `ActivityHeatmapData`, `DayActivity` from `lib/github/commit-activity.ts` (Task 1).
- Produces: `ActivityHeatmap({ data: ActivityHeatmapData })` component, consumed by Task 3's page.

- [ ] **Step 1: Create `components/changelog/ActivityHeatmap.tsx`**

```tsx
import type { ActivityHeatmapData, DayActivity } from '@/lib/github/commit-activity';

interface ActivityHeatmapProps {
  data: ActivityHeatmapData;
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tierFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 12) return 3;
  return 4;
}

function formatTooltip(day: DayActivity): string {
  const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (day.count === 0) return `No commits on ${label}`;
  return `${day.count} commit${day.count === 1 ? '' : 's'} on ${label}`;
}

/** Groups the dense day list into Sun-Sat week columns, padding the first week with nulls before launch date. */
function buildWeeks(days: DayActivity[]): (DayActivity | null)[][] {
  if (days.length === 0) return [];
  const firstDayOfWeek = new Date(`${days[0].date}T00:00:00Z`).getUTCDay(); // 0=Sun
  const cells: (DayActivity | null)[] = [...(Array(firstDayOfWeek).fill(null) as null[]), ...days];

  const weeks: (DayActivity | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** Returns a month label for the first week column that crosses into a new month, else null. */
function monthLabelsForWeeks(weeks: (DayActivity | null)[][]): (string | null)[] {
  let prevMonth: number | null = null;
  return weeks.map((week) => {
    const firstReal = week.find((d): d is DayActivity => d !== null);
    if (!firstReal) return null;
    const month = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth();
    if (month !== prevMonth) {
      prevMonth = month;
      return MONTH_LABELS[month];
    }
    return null;
  });
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const weeks = buildWeeks(data.days);
  if (weeks.length === 0) return null;

  const monthLabels = monthLabelsForWeeks(weeks);
  const summary = `Commit activity heatmap: ${data.totalCommits.toLocaleString()} commits across ${weeks.length} weeks since launch`;

  return (
    <div className="activity-heatmap">
      <p className="activity-heatmap-headline">
        <strong>{data.totalCommits.toLocaleString()}</strong> commits shipped since launch
      </p>
      <div className="activity-heatmap-scroll">
        <div className="activity-heatmap-grid" role="img" aria-label={summary}>
          <div className="activity-heatmap-months">
            {monthLabels.map((label, i) => (
              <span key={i} className="activity-heatmap-month">
                {label ?? ''}
              </span>
            ))}
          </div>
          <div className="activity-heatmap-body">
            <div className="activity-heatmap-daylabels">
              {DAY_LABELS.map((label, i) => (
                <span key={i} className="activity-heatmap-daylabel">
                  {label}
                </span>
              ))}
            </div>
            <div className="activity-heatmap-weeks">
              {weeks.map((week, wi) => (
                <div className="activity-heatmap-week" key={wi}>
                  {week.map((day, di) =>
                    day ? (
                      <span
                        key={di}
                        className={`activity-heatmap-cell activity-heatmap-cell--${tierFor(day.count)}`}
                        title={formatTooltip(day)}
                      />
                    ) : (
                      <span key={di} className="activity-heatmap-cell activity-heatmap-cell--pad" aria-hidden="true" />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="activity-heatmap-legend" aria-hidden="true">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((tier) => (
          <span key={tier} className={`activity-heatmap-cell activity-heatmap-cell--${tier}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append heatmap styles to `components/landing/landing-styles.css`**

Insert after the existing `.bullpen-landing-root .changelog-pill--fixed` rule (currently the last rule in the file, ending line 594):

```css

/* ─── Changelog activity heatmap ────────────────────────────────────────── */
.bullpen-landing-root .activity-heatmap {
  max-width: 780px;
  margin: 0 auto 56px;
}

.bullpen-landing-root .activity-heatmap-headline {
  font-size: 14px;
  color: var(--fg-muted);
  margin-bottom: 14px;
}

.bullpen-landing-root .activity-heatmap-headline strong {
  color: var(--fg);
  font-weight: 600;
}

.bullpen-landing-root .activity-heatmap-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.bullpen-landing-root .activity-heatmap-grid {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100%;
}

.bullpen-landing-root .activity-heatmap-months {
  display: flex;
  gap: 3px;
  padding-left: 28px;
}

.bullpen-landing-root .activity-heatmap-month {
  width: 14px;
  font-size: 11px;
  color: var(--fg-dim);
  flex-shrink: 0;
}

.bullpen-landing-root .activity-heatmap-body {
  display: flex;
  gap: 6px;
}

.bullpen-landing-root .activity-heatmap-daylabels {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 22px;
  flex-shrink: 0;
}

.bullpen-landing-root .activity-heatmap-daylabel {
  height: 11px;
  font-size: 10px;
  line-height: 11px;
  color: var(--fg-dim);
}

.bullpen-landing-root .activity-heatmap-weeks {
  display: flex;
  gap: 3px;
}

.bullpen-landing-root .activity-heatmap-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bullpen-landing-root .activity-heatmap-cell {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  display: inline-block;
}

.bullpen-landing-root .activity-heatmap-cell--pad {
  background: transparent;
}

.bullpen-landing-root .activity-heatmap-cell--0 {
  background: var(--border);
}

.bullpen-landing-root .activity-heatmap-cell--1 {
  background: oklch(0.72 0.17 152 / 0.25);
}

.bullpen-landing-root .activity-heatmap-cell--2 {
  background: oklch(0.72 0.17 152 / 0.45);
}

.bullpen-landing-root .activity-heatmap-cell--3 {
  background: oklch(0.72 0.17 152 / 0.7);
}

.bullpen-landing-root .activity-heatmap-cell--4 {
  background: oklch(0.72 0.17 152 / 1);
}

.bullpen-landing-root .activity-heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--fg-dim);
}

.bullpen-landing-root .activity-heatmap-legend .activity-heatmap-cell {
  width: 10px;
  height: 10px;
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline.

- [ ] **Step 4: Commit**

```bash
git add components/changelog/ActivityHeatmap.tsx components/landing/landing-styles.css
git commit -m "feat: add ActivityHeatmap component and styles"
```

---

### Task 3: Wire into the changelog page

**Files:**
- Modify: `app/changelog/page.tsx`

**Interfaces:**
- Consumes: `getCommitActivity()` from `lib/github/commit-activity.ts` (Task 1), `ActivityHeatmap` from `components/changelog/ActivityHeatmap.tsx` (Task 2).

- [ ] **Step 1: Make `ChangelogPage` async and render the heatmap**

In `app/changelog/page.tsx`, add the imports after the existing `Footer` import (line 6):

```tsx
import { Footer } from '@/components/landing/Footer';
import { getCommitActivity } from '@/lib/github/commit-activity';
import { ActivityHeatmap } from '@/components/changelog/ActivityHeatmap';
import '@/components/landing/landing-styles.css';
```

Change the component signature (line 47) from:

```tsx
export default function ChangelogPage() {
  const groups = readChangelog();
```

to:

```tsx
export default async function ChangelogPage() {
  const groups = readChangelog();
  const activity = await getCommitActivity();
```

Insert the heatmap render between the intro paragraph and the `changelog-list` div (currently lines 66-70):

```tsx
          <p style={{ color: 'var(--fg-muted)', marginBottom: 48 }}>
            What&apos;s new, improved, and fixed in BullPen.
          </p>

          {activity && <ActivityHeatmap data={activity} />}

          <div className="changelog-list">
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors, same warning baseline.

- [ ] **Step 3: Manual verification — happy path**

Run `npm run dev`, navigate to `http://localhost:3000/changelog`.

Expected: headline stat reads "N commits shipped since launch" with a plausible N (400+). Below it, a week grid renders with emerald-tinted cells of varying intensity, month labels along the top, Mon/Wed/Fri labels on the left, a "Less → More" legend bottom-right. Hovering a cell shows a native tooltip with the date and commit count. Resize the browser to ~375px width — the grid scrolls horizontally within its own container instead of squeezing or overflowing the page. The rest of the page (date-grouped entries below) is unaffected.

- [ ] **Step 4: Manual verification — failure path**

Temporarily break the fetch to confirm graceful degradation. In `lib/github/commit-activity.ts`, change `const REPO = 'DavidHasselhoe/BullPen';` to `const REPO = 'DavidHasselhoe/does-not-exist';`, restart `npm run dev`, reload `/changelog`.

Expected: the heatmap section does not render (no error boundary, no broken layout) — the page shows the intro paragraph followed directly by the date-grouped entries list, exactly as it did before this feature existed.

Revert the change:

```tsx
const REPO = 'DavidHasselhoe/BullPen';
```

Confirm `/changelog` shows the heatmap again after reverting and restarting.

- [ ] **Step 5: Commit**

```bash
git add app/changelog/page.tsx
git commit -m "feat: render activity heatmap on the changelog page"
```

---

## Post-implementation

This is public-facing frontend work on a page a visitor reacts to visually — per `CLAUDE.md`'s pre-ship polish requirement, run `/impeccable polish app/changelog/page.tsx` before considering this done, then push to `preview`:

```bash
git push origin preview
```

Do **not** merge to `main` — per the standing session instruction, `preview` → `main` merges only happen when the user explicitly says "end session".
