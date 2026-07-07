# Public Changelog — Design

## Purpose

Give visitors (and prospective users) a public, trust-building record of what's shipped, without turning it into a maintenance chore. Auto-generated at the end of each dev session as part of the existing End Session Protocol, so it never falls out of sync with what actually shipped to `main`.

## Data storage

A git-committed JSON file: `content/changelog.json`.

Chosen over a Supabase table because this content is tied 1:1 to git history (what's on `main` is what's live), and a file fits the existing `preview` → `main` deploy flow without adding a database dependency for static marketing content.

Shape — one entry per session that produced user-facing change, newest first:

```json
[
  {
    "date": "2026-07-07",
    "entries": [
      { "type": "new", "text": "Added an AI assistant to the fullscreen chart" },
      { "type": "improved", "text": "Onboarding now starts with a starter-holdings picker instead of a market-selection step" },
      { "type": "fixed", "text": "Top Movers date label now accounts for holidays" }
    ]
  }
]
```

`type` is one of `"new" | "improved" | "fixed"`.

## Content guidelines (followed by Claude when generating entries, no user review gate)

- **Include**: new features, meaningful UX/behavior changes, user-noticeable bug fixes.
- **Exclude**: pure internal refactors, RLS/perf-only commits, dependency bumps, doc/CLAUDE.md-only changes — anything invisible to an actual user.
- **Language**: plain, non-technical, no file paths, no ticket/commit references, no jargon — written for a visitor, not a developer.
- If a session produced nothing changelog-worthy, no entry is added for that date — no filler/padding entries.

## Page & UI

New route: `app/changelog/page.tsx`.

- Follows the same pattern established by `app/privacy/page.tsx`: wrapped in `bullpen-landing-root` for the shared dark theme, same minimal header (logo + back-to-home link), shared `Footer` at the bottom.
- Reads `content/changelog.json` at request time (Server Component, `fs.readFileSync`), renders entries newest-first, grouped by date.
- Each entry: a date heading, then bullets tagged with a small colored pill per type — green "New", blue "Improved", amber "Fixed" — reusing existing `landing-styles.css` tokens (`--accent`, `--up`, `--down`) rather than introducing new colors.

### Footer change

Add a **"Changelog"** link to the **Product** column (next to "Roadmap"), pointing to `/changelog`. Other footer links remain untouched placeholder `#` anchors — out of scope for this work.

## End Session Protocol integration

New step added to CLAUDE.md's End Session Protocol, inserted after "confirm preview is ahead of main" and before "merge preview → main":

> **Generate changelog entry**
> Run `git log <content/changelog.json's last commit>..HEAD --oneline` on `preview` to see everything shipped since the changelog was last updated. If there's user-facing material in that range (per the content guidelines above), write one entry dated with today's date to `content/changelog.json`, commit it to `preview`, then continue to the merge step. If nothing in the range qualifies, skip silently — no empty/filler entry.

The entry's `date` is always the day the entry is generated (i.e., the end-session date), not the dates of the individual underlying commits. This keeps the changelog commit inside the existing lint-gated flow — it rides along with everything else going from `preview` → `main` → production, so it never drifts from what's actually live.

## Out of scope

- Editing/removing past changelog entries via any UI (git history is the edit mechanism, same as the rest of the repo).
- The other footer links ("Roadmap", "Blog", "Status", etc.) — still placeholders, untouched by this work.
- Any notification/subscription mechanism (RSS, email) for changelog updates.
