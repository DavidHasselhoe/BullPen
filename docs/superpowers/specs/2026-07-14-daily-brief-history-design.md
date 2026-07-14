# Daily Brief History — Design

## Problem

The Daily Brief only ever shows the single most recent edition (today's, or yesterday's as a same-day fallback before the 06:30 UTC cron has run). A Pro user who misses a day — or several — has no way to go back and read what they missed. Every past brief already exists in the database; there's simply no UI or API path to reach it.

## Key finding

`daily_briefs` already retains every edition forever — one row per `published_date` (unique), written once by the cron and never deleted or overwritten. This is not a storage-capacity problem: at ~650–800 words per brief, years of daily briefs amount to a few MB of text. **No schema change and no retention/pruning policy are needed.** This is a deliberate choice: storage is effectively free here, and deleting old briefs has a real (if small) downside — lost research/reference value — for no measurable upside. If this changes (e.g. a future compliance or cost reason to prune), that's a separate decision to revisit then, not now.

The actual gap is purely UI/API: no endpoint returns anything but the latest brief, and no component lets a user navigate to a past one.

## Scope

- One new API route returning the last 14 generated briefs (full content).
- Prev/next navigation and a "Past briefs" picker inside the existing `BriefReader` modal.
- No new page, no new nav entry, no schema/migration changes, no data deletion.

Out of scope (explicitly not building): a dedicated `/briefs` archive page, browsing beyond 14 editions, search/filter by date or ticker, per-user read/unread tracking.

## Data & API

**No migration.** `daily_briefs` schema is unchanged.

**New route: `GET /api/briefs/list`**
- Pro-gated identically to `/api/briefs/today` (`getTier` + `isPro`, 403 `{ success: false, error: 'upgrade_required' }` otherwise).
- `SELECT * FROM daily_briefs ORDER BY published_date DESC LIMIT 14`.
- Returns full brief objects (`id`, `published_date`, `title`, `content`, `featured_tickers`, `generated_at`) — not just headlines. At ~5KB/brief that's ~70KB for the full window, fetched once when the reader opens; every prev/next/list-click afterward is instant with no further round-trips.
- "14 most recently generated editions," not "last 14 calendar days" — if the cron doesn't produce a meaningful weekend edition, weekends simply don't appear as gaps in the list.

**`/api/briefs/today` is unchanged** — still powers the collapsed dashboard-widget preview row exactly as it does today.

## UI / Component changes

All changes are inside `components/discover/DailyBriefWidget.tsx`'s `BriefReader`. No new files, no new routes.

**Data fetching**: `BriefReader` adds a `useQuery(['daily-briefs-list'], ...)` against `/api/briefs/list`, gated with `enabled: open` so it only fires once the modal is actually opened — not on every dashboard load. `staleTime` matches the existing 5-minute convention used for `daily-brief-today`.

**State**: `BriefReader` tracks `currentIndex` into the fetched list. On open, it seeds its displayed brief from the `brief` prop already passed in (unchanged current behavior) so there's no loading flash; once the list resolves, it locates that same `published_date` within the list to establish the index for prev/next. If the list is still loading or fails, prev/next/history controls are simply disabled — the currently-open single brief keeps working regardless (fail-soft, matching `DailyBriefWidget`'s existing `error` handling philosophy).

**Header additions** (next to the existing close button):
- **Prev / Next chevrons** — step through the list oldest→newest. Disabled at either boundary of the fetched (≤14-item) list. No "load more" — going past 14 simply isn't possible, consistent with the chosen window.
- **"Past briefs" toggle** — opens a small dropdown/panel listing each fetched brief as `date — headline` (e.g. "Jul 14 — Markets surge as Fed signals pivot"). Clicking an entry sets `currentIndex` directly and closes the panel.

**Copy change**: the eyebrow label ("Daily Brief" / "Yesterday's Brief") collapses to a flat "Daily Brief" always. That binary distinction stops making sense once arbitrary past days are reachable — the existing `formatPublishedDate(brief.published_date)` line just below it already states which day is showing.

**Unchanged**: `DailyBriefWidget`'s collapsed preview row, the Pro-gate/locked/loading states there, and all per-brief rendering (`SectionBlock`, `SectionTOC`, inline ticker/bold parsing). This feature is purely additive navigation chrome around the reader that already exists.

## Edge cases

| Case | Behavior |
|---|---|
| Fewer than 14 briefs exist (e.g. shortly after ship) | List returns whatever exists; prev disables itself naturally at the true oldest. |
| `/api/briefs/list` fails or 403s mid-session | Hide/disable prev/next and the "Past briefs" toggle; the single already-open brief keeps rendering. |
| Currently-open brief isn't in the fetched list | Shouldn't occur in practice (the reader only ever opens via `today`'s brief, always within the list's 14-day window) — if it did, prev/next stay disabled until/unless the list resolves and contains it. |
| Reduced motion / accessibility | New controls reuse this file's existing button/transition conventions (`transition-colors`, `active:scale-*`) — no new animation primitives. |

## Explicitly not doing

- No retention cap or cleanup cron — see "Key finding" above.
- No dedicated archive page/route.
- No pagination past 14 editions.
- No search or filter.
