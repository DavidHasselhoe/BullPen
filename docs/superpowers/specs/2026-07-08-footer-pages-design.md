# Footer Pages — Design

## Purpose

The landing page footer has four columns of mostly-placeholder `#anchor` links (Product, Resources, Company, Legal). This build makes as many of them real as currently makes sense for BullPen, and removes the ones that don't apply (no hiring, no partner program, no public API docs, no blog content, no uptime-monitoring service yet).

## Scope decision (confirmed with user)

**Remove from the footer entirely** (not just unlink — delete the list item): Careers, API docs, Press kit, Partners, Data sources, Blog, Status.

**Build as new standalone pages**: About, Contact, Roadmap, Help Center, Glossary, Disclosures, Security.

**Out of scope, left as-is**:
- Terms of Service — user explicitly deferred this earlier in the same session (cost/liability tradeoff of a paid ToS generator).
- Product column's dead in-page anchors (`#daily-brief`, `#bullpen-ai`, `#screener`) — these are broken links to landing-page sections that don't exist, not standalone pages. Separate concern from this build; not touched here.

## Shared architecture

All seven new pages follow the exact pattern already proven by `app/privacy/page.tsx` and `app/changelog/page.tsx`:
- Wrapped in `.bullpen-landing-root` for the shared dark theme.
- Same minimal header: `Logo` (linking to `/`) + a "← Back to home" link.
- Shared `Footer` component at the bottom.
- Server components — no client-side data fetching except where noted (Contact's form).

Routes: `/about`, `/contact`, `/roadmap`, `/help`, `/glossary`, `/disclosures`, `/security`.

## Footer changes

- **Product column**: `Roadmap` link changes from `#roadmap` to `/roadmap`.
- **Resources column**: remove `API docs`, `Blog`, `Status`. Keep `Help center` → `/help`, add `Glossary` → `/glossary` (already existed as a placeholder link — point it at the real route).
- **Company column**: remove `Careers`, `Press kit`, `Partners`. Keep `About` → `/about`, `Contact` → `/contact`.
- **Legal column**: remove `Data sources`. Keep `Terms` as-is (still `#terms` placeholder — out of scope), `Privacy` (already `/privacy`), add `Disclosures` → `/disclosures`, `Security` → `/security`.

## Page-by-page content

### About
Short, factual: what BullPen is (reusing the existing tagline — "the stock research app for beginners who don't want to stay beginners"), who it's for, and that it's built by a solo Norwegian founder operating as Hasselø Bullpen. No fabricated personal backstory beyond what's established in this project.

### Help Center
Reuses the real Q&A content already written in `components/landing/FAQ.tsx` (the landing page's FAQ section) — read that component's data, present it as a standalone page. No new content authoring.

### Disclosures
Expands the existing footer disclaimer ("BullPen is not a registered investment advisor. Content is informational only...") into a full page, plus two pieces of content drafted earlier in this project's privacy-policy work but never placed anywhere:
- An AI-generated-content disclaimer (AI analysis/insights are informational, not financial advice).
- The SnapTrade trust clause: the brokerage connection is read-only, BullPen never receives login credentials, and neither BullPen nor SnapTrade can place trades or move funds.

### Security
Reframes the real security measures already catalogued for the privacy policy — Row Level Security on Supabase tables, API rate limiting, security headers (CSP, X-Frame-Options, etc.), service-role key never exposed client-side, SOC 2 Type II-backed vendors (SnapTrade) — as a trust/marketing page rather than a legal disclosure.

### Glossary
Server component importing `GLOSSARY` directly from `lib/finance/glossary.ts` (50 existing entries: `Record<string, { plainLabel: string; description: string }>`, already used for in-app tooltips). Renders as a flat, alphabetically-sorted list of term → plain-language label → description. No new content authoring; no attempt to preserve the source file's category comments (would require restructuring the data file — deferred).

### Roadmap
Same architecture as Changelog: a git-committed `content/roadmap.json` + `/roadmap` page rendering it, styled consistently with the Changelog page but using its own status vocabulary (e.g. a "Shipped" pill) since this page is historical, not forward-looking.

Content strategy (confirmed with user): launch with a genuine **product history** — real shipped milestones compiled from actual git history, not fabricated — followed by an honest "What's next" note that the forward-looking roadmap is still being scoped and will be added later (no fake commitments). The milestone list is compiled at implementation time by reviewing git log, using the same "is this user-facing and notable" filter already established for the Changelog feature (skip internal refactors, perf-only work, dependency bumps).

### Contact
The one page with real backend work, not just static content.

- **Data**: new Supabase migration adding a `contact_submissions` table (`id`, `name`, `email`, `message`, `created_at`). RLS: insert-only via the service-role API route; no public read/select policy.
- **API**: new `POST /api/contact` route. Validates input (non-empty name/message, valid email format), inserts the row via `createServerClient()`, then sends a notification email to `david@hasselo.no` via Resend (fire-and-forget — a failed email send must never block the response or lose the stored submission). Rate-limited via the existing `lib/security/rate-limit.ts` helper, since this is a public, unauthenticated endpoint.
- **Form**: client component with exactly three fields — Name, Email, Message (no category/subject dropdown — YAGNI). Posts to `/api/contact`, shows an inline success or error state after submit.

## Out of scope

- Status page (no real monitoring infrastructure exists yet — explicitly skipped, not deferred-and-placeholder).
- Terms of Service.
- Wiring the Product column's other dead anchors (`#daily-brief`, `#bullpen-ai`, `#screener`) to real sections.
- Grouping the Glossary by category.
- Any admin UI for reading Contact submissions (reading them is via direct Supabase dashboard/SQL access for now).
