# End Session Protocol

_Moved out of CLAUDE.md on 2026-10-19 so it is read when needed instead of sent with every request. CLAUDE.md points here._


When the user says **"end session"**, run this sequence in order. Stop and report if any step fails.

**1. Check for uncommitted changes from *any* session**
```bash
git status --short
```
This step exists because "always commit and push as you go" only holds within a session that reaches its own end — a session that's interrupted, crashes, or is closed early can leave real, finished work sitting uncommitted, and nothing about `git log origin/main..origin/preview` (step 3) ever looks at the working tree, so it stays invisible to every later "end session" run until someone thinks to check.

If `git status --short` is empty, skip to step 2. Otherwise, inspect every changed/untracked file (`git diff` per file, not just the stat line) and sort into:
- **Real, coherent, finished-looking work** (has a clear purpose, no `TODO`/debug leftovers, reads as complete) — stage and commit each distinct piece of work as its own commit with a real description, same as any other commit in this repo. Don't lump unrelated features into one commit just because they were discovered together.
- **Ambiguous or partial work** — surface it to the user with a summary of what it looks like; don't guess at intent or silently commit something that might be mid-edit.
- **Stray files** (unreferenced assets, tool-cache directories, anything that doesn't look like it belongs in the repo) — do not commit. Flag them and ask before doing anything else with them (never auto-delete).

Never commit a whole pile of unrelated uncommitted files as a single sweep — the same care applied to work written in the current session applies here.

**2. Lint check**
```bash
npm run lint
```
Fix any errors before proceeding. Warnings are acceptable.

**2b. Smoke the write paths**
```bash
npm run smoke-writes
```
Needs the dev server on :3000 (start it if it isn't running; never `npm run build` while it is). It signs in as the QA account, creates a watchlist, adds and removes a symbol, deletes the list, and asserts the watchlist tier gate for admin, Pro, bonus and Free. Lint and the code review both passed the 2026-10-30 bug where every watchlist create returned 403. A failure here blocks the merge.

**3. Confirm preview is ahead of main**
```bash
git log origin/main..origin/preview --oneline
```
If there are no commits ahead, nothing to merge — tell the user and stop.

**4. Review the diff before it reaches production**

Run `/code-review medium origin/main..origin/preview` on everything about to ship. Then check whether the range touches money, auth or the database:
```bash
git diff --name-only origin/main..origin/preview -- supabase/migrations lib/billing app/api/billing lib/auth app/auth app/api/auth app/api/invite app/api/admin lib/security lib/supabase middleware.ts
```
If that lists anything, also run `/security-review`. RLS policies, SECURITY DEFINER functions and reward or trial grants live in these paths, and the service role hides a broken policy from every normal test (the referral self-grant exploit and three dead RLS policy families both got through that way).

Fix a finding that is a clear bug, commit the fix to `preview`, push, and re-run lint. A finding that needs a judgment call (a behaviour change, a trade-off, anything you are not sure is real) goes to the user before step 6; don't merge past it. If both reviews come back clean, say so in one line and continue.

**5. Generate changelog entry**
Find the last commit that touched the changelog with `git log -1 --format=%H -- content/changelog.json`, then run `git log <that commit>..HEAD --date=iso-strict --pretty=format:'%ad %H %s'` on `preview` to see everything shipped since, **with each commit's timestamp**.

Date every changelog entry by the **UTC calendar date of the commit(s) that shipped it** — never by "today" / the date the end-session protocol happens to run. Convert each commit's local timestamp to UTC before bucketing (e.g. a commit at `2026-07-21T00:15:00+02:00` is UTC `2026-07-20T22:15:00Z`, so it belongs to the **2026-07-20** entry, not 2026-07-21). This matters because the dashboard's commit activity heatmap (`lib/github/commit-activity.ts`) buckets commits by GitHub's `commit.author.date` UTC day — if the changelog uses a different day, the two views disagree for anyone working past midnight local time.

If the commits since the last changelog entry span more than one UTC calendar day, **write one entry per day** (grouping each shipped item under the UTC date of the commit that introduced it), not one entry dated "today" for everything. Insert them newest-first, same as any other entries.

If there's user-facing material in that range — new features, meaningful UX/behavior changes, user-noticeable bug fixes — write it to `content/changelog.json`. Use plain, non-technical language: no file paths, no commit/ticket references, no jargon. Each item's `type` is exactly one of `"new" | "improved" | "fixed"`. Exclude pure internal refactors, perf/RLS-only commits, dependency bumps, doc/CLAUDE.md-only changes, and **anything scoped entirely to the public marketing/landing site** (the logged-out homepage and its sections, About/Contact/Roadmap/Glossary/Help Center/Disclosures/Security/Privacy/Changelog pages, footer/nav changes on those pages) — visual redesigns, copy tweaks, and new informational pages there are not product changes. Users only care about what changed in the actual app (dashboard, stock pages, tools, alerts, AI features); the changelog is for that, not the brochure. If nothing in the range qualifies, skip this step silently — do not add an empty or filler entry. Commit the change to `preview` before continuing. If an entry was added, run `npm run post-changelog-discord` to announce it in Discord.

**6. Merge preview → main and push**
```bash
git checkout main
git pull origin main
git merge origin/preview --no-edit
git push origin main
git checkout preview
```

**7. Confirm deployment triggered**
Use `mcp__claude_ai_Vercel__list_deployments` to verify a new deployment appeared for `main`. Report the deployment URL to the user.

**Why this matters:** Keeping `main` = what's in production means git history is the source of truth, the `sync-preview` GitHub Action stays a no-op, and there's no drift between the dashboard-promoted build and the actual branch state.

