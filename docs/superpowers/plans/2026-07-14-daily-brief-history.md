# Daily Brief History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pro users browse the last 14 Daily Brief editions (prev/next stepping + a "Past briefs" picker) from inside the existing brief reader modal, so missing a day no longer means losing access to it.

**Architecture:** One new Pro-gated API route (`GET /api/briefs/list`) returns the 14 most recently generated `daily_briefs` rows in full. The existing `BriefReader` component (inside `components/discover/DailyBriefWidget.tsx`) fetches that list lazily (only once opened), tracks which entry is currently displayed, and adds prev/next chevrons plus a small dropdown panel to jump to any of the 14. No schema changes, no new pages, no data deletion.

**Tech Stack:** Next.js App Router API route, Supabase (`daily_briefs` table, already exists), TanStack Query (`useQuery`), Radix Dialog (already in use), lucide-react icons, Tailwind.

## Global Constraints

- No migration — `daily_briefs` schema is unchanged (verified: one row per `published_date`, never deleted).
- No retention/pruning logic — data stays forever; this is a deliberate decision from the design spec.
- `GET /api/briefs/today` is not modified — it continues to power the dashboard widget's collapsed preview row exactly as today.
- The new route must use the identical Pro-gate pattern as `/api/briefs/today/route.ts` (`getTier` + `isPro`, 403 `{ success: false, error: 'upgrade_required' }`).
- No new dependencies — reuse `@tanstack/react-query`, `lucide-react`, `@radix-ui/react-dialog`, and this repo's existing `cn` utility, all already imported in the touched files.
- This repo has no unit/integration test framework for API routes or React components (per `CLAUDE.md`) — verification steps in this plan use `npm run lint` plus live browser checks via the Playwright MCP tools already available in this environment, not a test runner.

---

### Task 1: `GET /api/briefs/list` API route

**Files:**
- Create: `app/api/briefs/list/route.ts`

**Interfaces:**
- Produces: `GET /api/briefs/list` (session-authenticated via `withAuth`) →
  - 200: `{ success: true, briefs: DailyBriefRow[] }`, `briefs` ordered by `published_date` descending, at most 14 items. `DailyBriefRow` fields exactly match the `daily_briefs` table: `{ id: string; published_date: string; title: string; content: string; featured_tickers: string[]; generated_at: string }`.
  - 403 (not Pro/admin): `{ success: false, error: 'upgrade_required' }`
  - 500 (DB error): `{ success: false, error: string }`
- Consumes: `withAuth`, `addSecurityHeaders` from `@/lib/security/api-security`; `createServerClient` from `@/lib/supabase/client`; `getTier`, `isPro` from `@/lib/billing/tier` — all existing exports, used exactly as `app/api/briefs/today/route.ts` already uses them.

- [ ] **Step 1: Write the route**

Create `app/api/briefs/list/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';

async function handler(
  _request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  // Pro-only — same gate as /api/briefs/today.
  if (!isPro(await getTier(session.userId))) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'upgrade_required' }, { status: 403 })
    );
  }

  // The 14 most recently *generated* editions, not "last 14 calendar days" —
  // if a day has no brief (e.g. cron gap), it simply doesn't appear rather
  // than showing as an empty slot.
  const { data: briefs, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .order('published_date', { ascending: false })
    .limit(14);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json(
      { success: true, briefs: briefs ?? [] },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    )
  );
}

export const GET = withAuth(handler);
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors or warnings attributable to `app/api/briefs/list/route.ts`.

- [ ] **Step 3: Verify against the running dev server**

Ensure the dev server is running (`npm run dev`, default `http://localhost:3000`) and you're signed in as a Pro or admin account in the browser used for verification.

Using the Playwright MCP tools:
1. `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:3000/dashboard` (establishes an authenticated session in the browser context).
2. `mcp__plugin_playwright_playwright__browser_evaluate` with:
   ```js
   () => fetch('/api/briefs/list').then(r => r.json())
   ```
3. Confirm the result: `success: true`, `briefs` is an array of at most 14 objects, each with `id`, `published_date`, `title`, `content`, `featured_tickers`, `generated_at` populated, and `published_date` values in descending order.

If signed in as a free-tier account instead, confirm the result is `{ success: false, error: 'upgrade_required' }` with no `briefs` key.

- [ ] **Step 4: Commit**

```bash
git add app/api/briefs/list/route.ts
git commit -m "feat: add GET /api/briefs/list for Daily Brief history"
```

---

### Task 2: Browsable history in `BriefReader`

**Files:**
- Modify: `components/discover/DailyBriefWidget.tsx:7` (lucide-react import)
- Modify: `components/discover/DailyBriefWidget.tsx:82-86` (add `formatShortDate` helper)
- Modify: `components/discover/DailyBriefWidget.tsx:306-483` (the `BriefReader` function — full replacement)
- Modify: `components/discover/DailyBriefWidget.tsx:603` (call site — drop the now-removed `isToday` prop)

**Interfaces:**
- Consumes: `GET /api/briefs/list` from Task 1 → `{ success: boolean; briefs?: DailyBriefRow[] }`. Also consumes the existing `DailyBrief` interface already declared at the top of this file (unchanged), and existing helpers `parseSections`, `estimateReadingTime`, `formatPublishedDate`, `formatRelativeTime`, `slugToAssetPath`, `cn` — all already imported/defined in this file.
- Produces: `BriefReader` component signature changes from `{ brief: DailyBrief; isToday: boolean; open: boolean; onOpenChange: (open: boolean) => void }` to `{ brief: DailyBrief; open: boolean; onOpenChange: (open: boolean) => void }` — the `isToday` prop is removed (the eyebrow label collapses to a flat "Daily Brief" and no longer needs it). `DailyBriefWidget`'s own `isToday` local variable and its use in the *collapsed row* label are unaffected — only the prop passed to `<BriefReader>` is dropped.

- [ ] **Step 1: Update the lucide-react import**

In `components/discover/DailyBriefWidget.tsx`, replace line 7:

```tsx
import { X, ArrowUpRight } from 'lucide-react';
```

with:

```tsx
import { X, ArrowUpRight, ChevronLeft, ChevronRight, History } from 'lucide-react';
```

- [ ] **Step 2: Add the `formatShortDate` helper**

Immediately after the existing `formatPublishedDate` function (originally lines 82-86), add:

```tsx
function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}
```

So the two functions read, in order:

```tsx
function formatPublishedDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}
```

- [ ] **Step 3: Replace the `BriefReader` function**

Replace the entire `BriefReader` function (originally lines 306-483, from `function BriefReader({` through its closing `}`) with:

```tsx
function BriefReader({
  brief,
  open,
  onOpenChange,
}: {
  brief: DailyBrief;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history } = useQuery({
    queryKey: ['daily-briefs-list'],
    queryFn: async (): Promise<DailyBrief[]> => {
      const res = await fetch('/api/briefs/list');
      if (!res.ok) throw new Error('Failed to fetch brief history');
      const json = await res.json();
      if (!json.success || !Array.isArray(json.briefs)) throw new Error('Failed to fetch brief history');
      return json.briefs as DailyBrief[];
    },
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Reset navigation whenever the reader opens fresh (e.g. reopened later
  // with a new "today" brief after the day rolled over).
  useEffect(() => {
    if (open) {
      setManualIndex(null);
      setHistoryOpen(false);
    }
  }, [open, brief.id]);

  const historyIndexOfCurrent = useMemo(() => {
    if (!history) return -1;
    return history.findIndex((b) => b.published_date === brief.published_date);
  }, [history, brief.published_date]);

  const activeIndex = manualIndex ?? historyIndexOfCurrent;
  const displayedBrief = activeIndex >= 0 && history ? history[activeIndex] : brief;

  const canGoOlder = !!history && activeIndex >= 0 && activeIndex < history.length - 1;
  const canGoNewer = !!history && activeIndex > 0;

  function goOlder() {
    if (!history || activeIndex < 0) return;
    if (activeIndex + 1 < history.length) setManualIndex(activeIndex + 1);
  }
  function goNewer() {
    if (!history || activeIndex <= 0) return;
    setManualIndex(activeIndex - 1);
  }
  function selectBrief(index: number) {
    setManualIndex(index);
    setHistoryOpen(false);
  }

  const sections = useMemo(() => parseSections(displayedBrief.content), [displayedBrief.content]);
  const readingMinutes = useMemo(() => estimateReadingTime(displayedBrief.content), [displayedBrief.content]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSlug, setActiveSlug] = useState<string | null>(sections[0]?.slug ?? null);
  const [progress, setProgress] = useState(0);

  // Reset scroll + progress when the reader opens, OR when the displayed
  // brief changes (reopening, or navigating via prev/next/history panel).
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0 });
        setProgress(0);
        setActiveSlug(sections[0]?.slug ?? null);
      });
    }
  }, [open, displayedBrief.published_date, sections]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    setProgress(Math.min(1, el.scrollTop / max));

    // Use getBoundingClientRect so positions are always relative to the
    // actual viewport, not the fixed modal ancestor (which offsetTop would be).
    const containerTop = el.getBoundingClientRect().top;
    const triggerOffset = 140; // px from container top edge to consider "active"

    let active = sections[0]?.slug ?? null;
    for (const section of sections) {
      const ref = sectionRefs.current[section.slug];
      if (!ref) continue;
      if (ref.getBoundingClientRect().top - containerTop <= triggerOffset) {
        active = section.slug;
      }
    }
    setActiveSlug(active);
  }

  function navigateTo(slug: string) {
    const target = sectionRefs.current[slug];
    const root = scrollRef.current;
    if (!target || !root) return;
    root.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
  }

  const topTickers = (displayedBrief.featured_tickers ?? [])
    .filter((t) => t.length >= 1 && t.length <= 5)
    .slice(0, 6);

  // TL;DR detection — first section whose slug starts with "tl"
  const tldrSlug = sections.find((s) => s.slug.startsWith('tl'))?.slug ?? null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[6px] animate-brief-overlay-in"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 bg-background outline-none flex flex-col overflow-hidden shadow-2xl',
            // Mobile (<768px): bottom sheet anchored to bottom edge
            'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t border-border/40 max-md:animate-slide-up',
            // Desktop (≥768px): centered modal — overrides the bottom positioning
            'md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
            'md:w-[92vw] md:max-w-4xl md:rounded-2xl md:border md:border-border/40',
            'md:animate-brief-modal-in'
          )}
        >
          <DialogPrimitive.Title className="sr-only">{displayedBrief.title}</DialogPrimitive.Title>

          {/* Reading progress bar */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-border/15 z-20 overflow-hidden">
            <div
              className="h-full bg-primary/70 origin-left will-change-transform"
              style={{ transform: `scaleX(${progress})`, transition: 'transform 80ms linear' }}
            />
          </div>

          {/* Mobile drag handle */}
          <div className="flex justify-center pt-2.5 shrink-0 md:hidden">
            <div className="w-9 h-[3px] rounded-full bg-border/50" />
          </div>

          {/* Hero header */}
          <header className="px-6 md:px-8 pt-5 md:pt-7 pb-5 shrink-0 border-b border-border/30 relative">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/75">
                    Daily Brief
                  </span>
                </div>
                <h2 className="text-xl md:text-[26px] font-semibold text-foreground leading-tight tracking-tight pr-28 md:pr-32">
                  {displayedBrief.title}
                </h2>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-3 text-[11px] text-muted-foreground/70 font-mono">
                  <span>{formatPublishedDate(displayedBrief.published_date)}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{readingMinutes} min read</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>Generated {formatRelativeTime(displayedBrief.generated_at)}</span>
                </div>
              </div>

              <div className="absolute top-5 right-5 md:top-7 md:right-7 flex items-center gap-1">
                {history && history.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goOlder}
                      disabled={!canGoOlder}
                      aria-label="Older brief"
                      title="Older brief"
                      className="text-muted-foreground/50 hover:text-foreground transition-all duration-150 p-1.5 rounded-lg hover:bg-muted/40 active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goNewer}
                      disabled={!canGoNewer}
                      aria-label="Newer brief"
                      title="Newer brief"
                      className="text-muted-foreground/50 hover:text-foreground transition-all duration-150 p-1.5 rounded-lg hover:bg-muted/40 active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-transparent"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen((v) => !v)}
                      aria-expanded={historyOpen}
                      aria-label="Past briefs"
                      title="Past briefs"
                      className={cn(
                        'transition-all duration-150 p-1.5 rounded-lg active:scale-95',
                        historyOpen
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/40'
                      )}
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </>
                )}
                <DialogPrimitive.Close
                  className="text-muted-foreground/50 hover:text-foreground transition-all duration-150 p-1.5 rounded-lg hover:bg-muted/40 active:scale-95"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>
            </div>

            {topTickers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {topTickers.map((ticker) => (
                  <Link
                    key={ticker}
                    href={slugToAssetPath(ticker)}
                    className="text-[11px] font-mono font-medium text-foreground/80 bg-muted/40 hover:bg-muted/70 hover:text-foreground transition-all duration-150 px-2 py-0.5 rounded border border-border/30 hover:border-border"
                  >
                    ${ticker}
                  </Link>
                ))}
              </div>
            )}

            {historyOpen && history && (
              <div className="absolute top-14 right-5 md:top-16 md:right-7 z-30 w-72 max-h-80 overflow-y-auto rounded-lg border border-border/40 bg-background shadow-lg py-1.5">
                {history.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectBrief(i)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-muted/40',
                      i === activeIndex && 'bg-muted/30'
                    )}
                  >
                    <span className="block font-mono text-[10px] text-muted-foreground/60">
                      {formatShortDate(b.published_date)}
                    </span>
                    <span className="block text-foreground/90 truncate">{b.title}</span>
                  </button>
                ))}
              </div>
            )}
          </header>

          {/* Body: TOC (desktop) + content */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <SectionTOC
              sections={sections}
              activeSlug={activeSlug}
              onNavigate={navigateTo}
            />

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="overflow-y-auto flex-1 brief-scroll px-6 md:px-10 py-7"
            >
              <article className="max-w-[640px] mx-auto md:mx-0">
                {sections.map((section, i) => (
                  <SectionBlock
                    key={section.slug || i}
                    section={section}
                    index={i}
                    isTldr={section.slug === tldrSlug}
                    sectionRef={(el) => {
                      sectionRefs.current[section.slug] = el;
                    }}
                  />
                ))}
                <p className="text-[10px] text-muted-foreground/30 tracking-[0.15em] uppercase pt-2 pb-2 select-none">
                  Generated by Claude · Live web search
                </p>
              </article>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

- [ ] **Step 4: Update the call site**

Find where `BriefReader` is rendered near the end of `DailyBriefWidget` (originally line 603):

```tsx
<BriefReader brief={brief} isToday={isToday} open={isOpen} onOpenChange={setIsOpen} />
```

Replace with:

```tsx
<BriefReader brief={brief} open={isOpen} onOpenChange={setIsOpen} />
```

Do **not** remove the `isToday` local variable or its use in `DailyBriefWidget`'s own collapsed-row label (the `{isToday ? 'Daily brief' : "Yesterday's brief"}` span) — that usage is unrelated and unchanged.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors or warnings — specifically confirm there's no "unused variable" warning for anything in `DailyBriefWidget.tsx`, and no TypeScript error about `isToday` being passed to `BriefReader` (it should no longer be in that component's prop type).

- [ ] **Step 6: Commit**

```bash
git add components/discover/DailyBriefWidget.tsx
git commit -m "feat: prev/next and past-briefs picker in the Daily Brief reader"
```

---

### Task 3: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm the dev server is running**

Run: `npm run dev` (if not already running) and wait for `Ready` in the output.

- [ ] **Step 2: Open the dashboard and the Daily Brief reader**

Using the Playwright MCP tools, as a signed-in Pro/admin account:
1. `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:3000/dashboard`.
2. Take a snapshot (`mcp__plugin_playwright_playwright__browser_snapshot`) and locate the Daily Brief widget row.
3. Click it to open the reader.
4. Take a screenshot. Confirm the header eyebrow reads "Daily Brief" (not "Yesterday's Brief") regardless of which day is showing.

- [ ] **Step 3: Verify prev/next navigation**

1. If prev/next chevrons are visible (they only render when 2+ briefs exist — if your test account has fewer, run the cron manually first via `npm run trigger-cron` on at least 2 different days' worth of data, or accept a single-brief state and skip to Step 5 confirming the controls are correctly absent).
2. Click the "older" chevron. Confirm the title, date line, and body content change to the next-oldest brief, and that scroll position resets to the top.
3. Confirm the "newer" chevron is now enabled; click it and confirm it returns to the original brief.
4. Confirm the "older" chevron becomes disabled once you reach the oldest of the fetched (≤14) briefs.

- [ ] **Step 4: Verify the "Past briefs" picker**

1. Click the history (clock-arrow) icon.
2. Confirm a panel appears listing each fetched brief as a short date + headline.
3. Click an entry partway down the list. Confirm the panel closes and the reader now shows that brief's content, with scroll reset to top.
4. Reopen the picker and confirm the just-selected entry is visually marked as active.

- [ ] **Step 5: Verify the no-history / single-brief case**

If only one brief exists in the last 14 days (e.g. a fresh environment), confirm the prev/next chevrons and the history icon are **not** rendered at all (not just disabled) — only the close (X) button should appear in the header control cluster.

- [ ] **Step 6: Verify the free-tier path is unaffected**

Sign in (or switch) to a free-tier account, navigate to `/dashboard`, and confirm the Daily Brief widget still shows the existing locked/blurred upsell state — unchanged by this work, since `/api/briefs/today` was not modified.

- [ ] **Step 7: Final lint pass**

Run: `npm run lint`
Expected: `0 errors` (warning count may match the pre-existing baseline from before this feature; no new errors).

No commit needed for this task unless a fixup was required during verification — if so, commit that fixup with a `fix:` message referencing what verification step caught it.
