# Public Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public `/changelog` page fed by a git-committed JSON file, styled to match the existing dark landing theme, linked from the footer, and auto-populated by a new step in CLAUDE.md's End Session Protocol.

**Architecture:** Static content (`content/changelog.json`) read at request time by a Server Component route (`app/changelog/page.tsx`), styled via additions to the existing `components/landing/landing-styles.css` (same theme-token approach used for `/privacy`). No database, no client-side state, no test framework in this repo — verification is `npm run lint` plus a dev-server + `curl` check, matching how `/privacy` was built and verified earlier in this project.

**Tech Stack:** Next.js 16 App Router, TypeScript, plain CSS custom properties (no Tailwind used on the landing surface), Node `fs`/`path` for reading the JSON file server-side.

## Global Constraints

- No test framework exists in this repo (per CLAUDE.md `## Commands`) — every task's verification step is `npm run lint` (must be 0 errors; warnings acceptable) plus a manual dev-server check, never a unit test.
- `content/legal/` is reserved for Termly-generated legal documents — the changelog file goes at `content/changelog.json` (sibling to, not inside, `legal/`).
- All new UI must live inside the `.bullpen-landing-root` scope and use its existing CSS custom properties (`--fg`, `--fg-muted`, `--fg-dim`, `--border`, `--accent`, `--bg`, `--bg-2`, `--surface`) — never hardcoded colors, per the pattern already established in `landing-styles.css` and `app/privacy/page.tsx`.
- Never create feature branches — all commits go directly to `preview` (per CLAUDE.md `## Branch Strategy`).
- Changelog entry `type` is always exactly one of `"new" | "improved" | "fixed"` — this exact union is used in both the JSON data and the page component; do not introduce a fourth category.

---

### Task 1: Changelog data file + styling primitives

**Files:**
- Create: `content/changelog.json`
- Modify: `components/landing/landing-styles.css` (append after the existing `.legal-doc` block added for `/privacy`)

**Interfaces:**
- Produces: a JSON file matching the shape `{ date: string; entries: { type: 'new' | 'improved' | 'fixed'; text: string }[] }[]`, newest-first.
- Produces: CSS classes `.changelog-list`, `.changelog-date-group`, `.changelog-date`, `.changelog-items`, `.changelog-item`, `.changelog-pill`, `.changelog-pill--new`, `.changelog-pill--improved`, `.changelog-pill--fixed` — consumed by Task 2.

- [ ] **Step 1: Create the seed data file**

Create `content/changelog.json` with today's real, user-facing changes from this session (the privacy policy page shipping, and this changelog feature itself):

```json
[
  {
    "date": "2026-07-07",
    "entries": [
      { "type": "new", "text": "Published our Privacy Policy" },
      { "type": "new", "text": "Added a public changelog so you can see what's new" }
    ]
  }
]
```

- [ ] **Step 2: Validate the JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('content/changelog.json', 'utf-8')); console.log('valid')"`
Expected output: `valid`

- [ ] **Step 3: Append changelog styles to landing-styles.css**

Open `components/landing/landing-styles.css` and add the following immediately after the closing `}` of the last rule in the `.legal-doc` block (the `.bullpen-landing-root .legal-doc li` rule added when `/privacy` was built):

```css

/* ─── Changelog page ────────────────────────────────────────────────────── */
.bullpen-landing-root .changelog-list {
  max-width: 640px;
  margin: 0 auto;
}

.bullpen-landing-root .changelog-date-group {
  margin-bottom: 40px;
}

.bullpen-landing-root .changelog-date {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin-bottom: 14px;
}

.bullpen-landing-root .changelog-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bullpen-landing-root .changelog-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--fg);
}

.bullpen-landing-root .changelog-pill {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 2px 9px;
  border-radius: 999px;
  line-height: 1.6;
}

.bullpen-landing-root .changelog-pill--new {
  color: var(--up);
  background: oklch(0.72 0.17 152 / 0.15);
}

.bullpen-landing-root .changelog-pill--improved {
  color: oklch(0.75 0.15 250);
  background: oklch(0.75 0.15 250 / 0.15);
}

.bullpen-landing-root .changelog-pill--fixed {
  color: oklch(0.78 0.13 80);
  background: oklch(0.78 0.13 80 / 0.15);
}
```

- [ ] **Step 4: Lint check**

Run: `npx eslint components/landing/landing-styles.css`
Expected: warning only (`File ignored because no matching configuration was supplied` — this is expected and pre-existing for `.css` files in this repo, not a new error).

- [ ] **Step 5: Commit**

```bash
git add content/changelog.json components/landing/landing-styles.css
git commit -m "feat(changelog): add changelog data file and page styles"
git push origin preview
```

---

### Task 2: Changelog page

**Files:**
- Create: `app/changelog/page.tsx`

**Interfaces:**
- Consumes: `content/changelog.json` (shape from Task 1: `{ date: string; entries: { type: 'new' | 'improved' | 'fixed'; text: string }[] }[]`), and the CSS classes from Task 1.
- Consumes: `Logo` from `@/components/landing/Atoms` and `Footer` from `@/components/landing/Footer` (both already used identically by `app/privacy/page.tsx`).
- Produces: the `/changelog` route.

- [ ] **Step 1: Create the page**

Create `app/changelog/page.tsx`:

```tsx
import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Changelog — BullPen',
  description: "What's new in BullPen — features, improvements, and fixes.",
};

type ChangelogEntryType = 'new' | 'improved' | 'fixed';

interface ChangelogEntry {
  type: ChangelogEntryType;
  text: string;
}

interface ChangelogDateGroup {
  date: string;
  entries: ChangelogEntry[];
}

const PILL_LABEL: Record<ChangelogEntryType, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

function readChangelog(): ChangelogDateGroup[] {
  const filePath = path.join(process.cwd(), 'content', 'changelog.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ChangelogDateGroup[];
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  const groups = readChangelog();

  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Changelog</h1>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 48 }}>
            What&apos;s new, improved, and fixed in BullPen.
          </p>

          <div className="changelog-list">
            {groups.map((group) => (
              <div className="changelog-date-group" key={group.date}>
                <div className="changelog-date">{formatDate(group.date)}</div>
                <div className="changelog-items">
                  {group.entries.map((entry, i) => (
                    <div className="changelog-item" key={i}>
                      <span className={`changelog-pill changelog-pill--${entry.type}`}>
                        {PILL_LABEL[entry.type]}
                      </span>
                      <span>{entry.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `npx eslint app/changelog/page.tsx`
Expected: `0 problems`

- [ ] **Step 3: Start the dev server and verify the route renders**

```bash
npm run dev &
sleep 6
curl -s http://localhost:3000/changelog | grep -o "Published our Privacy Policy"
curl -s http://localhost:3000/changelog | grep -o "changelog-pill--new"
```
Expected: both greps print a match (confirms the JSON data and CSS classes are both present in the rendered HTML).

- [ ] **Step 4: Stop the dev server**

```bash
pkill -f "next dev"
```

- [ ] **Step 5: Commit**

```bash
git add app/changelog/page.tsx
git commit -m "feat(changelog): add /changelog page"
git push origin preview
```

---

### Task 3: Footer link + End Session Protocol wiring

**Files:**
- Modify: `components/landing/Footer.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the `/changelog` route from Task 2.
- Produces: no new interfaces — this is pure wiring/integration.

- [ ] **Step 1: Add the Changelog link to the footer**

In `components/landing/Footer.tsx`, find the `Product` column's `links` array:

```tsx
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Daily Brief', href: '#daily-brief' },
      { label: 'BullPen AI', href: '#bullpen-ai' },
      { label: 'Screener', href: '#screener' },
      { label: 'Roadmap', href: '#roadmap' },
    ],
  },
```

Replace it with (adds one new entry after `Roadmap`):

```tsx
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Daily Brief', href: '#daily-brief' },
      { label: 'BullPen AI', href: '#bullpen-ai' },
      { label: 'Screener', href: '#screener' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
```

- [ ] **Step 2: Lint check**

Run: `npx eslint components/landing/Footer.tsx`
Expected: `0 problems`

- [ ] **Step 3: Verify the footer link on the homepage**

```bash
npm run dev &
sleep 6
curl -s http://localhost:3000/ | grep -o 'href="/changelog"'
pkill -f "next dev"
```
Expected: prints `href="/changelog"`.

- [ ] **Step 4: Add the changelog generation step to CLAUDE.md's End Session Protocol**

In `CLAUDE.md`, find this exact block (currently steps 1–4 of the End Session Protocol):

```markdown
**2. Confirm preview is ahead of main**
```bash
git log origin/main..origin/preview --oneline
```
If there are no commits ahead, nothing to merge — tell the user and stop.

**3. Merge preview → main and push**
```bash
git checkout main
git pull origin main
git merge origin/preview --no-edit
git push origin main
git checkout preview
```

**4. Confirm deployment triggered**
Use `mcp__claude_ai_Vercel__list_deployments` to verify a new deployment appeared for `main`. Report the deployment URL to the user.
```

Replace it with (inserts a new step 3, renumbers the old 3→4 and 4→5):

```markdown
**2. Confirm preview is ahead of main**
```bash
git log origin/main..origin/preview --oneline
```
If there are no commits ahead, nothing to merge — tell the user and stop.

**3. Generate changelog entry**
Run `git log <content/changelog.json's last commit>..HEAD --oneline` on `preview` to see everything shipped since the changelog was last updated. If there's user-facing material in that range — new features, meaningful UX/behavior changes, user-noticeable bug fixes — write one entry dated with today's date to `content/changelog.json` (newest entry first in the array). Use plain, non-technical language: no file paths, no commit/ticket references, no jargon. Each item's `type` is exactly one of `"new" | "improved" | "fixed"`. Exclude pure internal refactors, perf/RLS-only commits, dependency bumps, and doc/CLAUDE.md-only changes. If nothing in the range qualifies, skip this step silently — do not add an empty or filler entry. Commit the change to `preview` before continuing.

**4. Merge preview → main and push**
```bash
git checkout main
git pull origin main
git merge origin/preview --no-edit
git push origin main
git checkout preview
```

**5. Confirm deployment triggered**
Use `mcp__claude_ai_Vercel__list_deployments` to verify a new deployment appeared for `main`. Report the deployment URL to the user.
```

- [ ] **Step 5: Verify the CLAUDE.md edit**

Run: `grep -n "Generate changelog entry" CLAUDE.md`
Expected: one match, inside the `## End Session Protocol` section.

- [ ] **Step 6: Commit**

```bash
git add components/landing/Footer.tsx CLAUDE.md
git commit -m "feat(changelog): link footer to /changelog, wire generation into End Session Protocol"
git push origin preview
```

---

## Final verification (run after all three tasks are complete)

```bash
npm run lint
```
Expected: 0 errors (warnings acceptable, per this repo's existing baseline).

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/changelog
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
pkill -f "next dev"
```
Expected: both requests return `200`.
