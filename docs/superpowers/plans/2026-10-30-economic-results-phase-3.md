# Economic Results Phase 3 (Reach) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the release results where people already are: today's results on the Home "Coming up" card, a "See the latest numbers" link after the two macro lessons, and real numbers in Ask Bull.

**Architecture:** Reuse what phases 1 and 2 built. The verdict wording (`economicResultText`, navigation `notifEcon*` keys) moves to a client-safe module so Home renders the same sentence the notification uses. The Academy link is a code-side map keyed by the lesson paths already in `economic-kinds.ts`, so no lesson content migration. Bull's existing `getEconomicCalendar` already returns `results` and `verdict`; only its description and a per-event page link change.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, react-i18next (i18next 25 number formatter), Vercel AI SDK tools.

**Spec:** `docs/superpowers/plans/2026-10-29-economic-event-results.md` §4.5 and §4.8 phase 3. Phase 2 shipped in this session (notifications, see memory `project_economic_results`).

**Already done in phase 1, no task:** the `/tools` index card (`app/tools/page.tsx:36`) and the sitemap entries (`app/sitemap.ts:45-46`). The calendar day panel already shows inline results (`components/economy/CalendarResult.tsx`).

**Changed from the spec:** §4.5 says to edit the Academy lessons by migration. Lesson `content` has no link field (`ReadContentSchema` in `types/academy.ts` is sections + terms only), so a migration would need a schema change plus translated lesson JSON. A code map rendered on the reward screen does the same job with one translated key.

## Global Constraints

- No em dash or en dash in any user-facing copy (CLAUDE.md "Writing UI Copy").
- No consensus, no "beat/miss", no market odds or proxies for them (memory `feedback-never-ship-synthetic-numbers`). Only actual vs previous, the 2% target, and fixed plain meanings.
- Every new key goes into en, de, es, fr, ja, no, zh by hand, with `_meta.json` hashes (sha256 of the en string, key `<ns>.<key>`), then `npm run i18n:pseudo` for qa. Do not run `i18n:translate`: other sessions have uncommitted locale edits it would rewrite.
- Numbers in copy use the i18next formatter (`{{value, number(minimumFractionDigits: 1; maximumFractionDigits: 1)}}`), never `toLocaleString(undefined)`.
- TanStack queries keep the dynamic param in `queryKey` and an explicit `staleTime`.
- Result text is templated, not model-written: let it wrap, never `truncate` or `line-clamp` it.
- `c:\bullpen` is shared with other sessions: edit additively, never stash, and don't commit. End session commits.
- Run `npm run lint` before finishing. A Bull routing run costs a few cents, so ask the user before running it (memory `feedback-ask-before-paid-api-runs`).

## Review Focus

1. **Released but not yet filled** (8:30 ET until FRED catches up, about 1h45m on 10-29): Home must keep the scheduled wording ("CPI at 8:30 AM"), never a blank row or a result from an older release. Task 2 pins this.
2. **A result without its headline** (`economicResultText` returns null): Home falls back to the scheduled wording. Task 2 pins this.
3. **Home cache:** `staleTime` is 1 hour, so a result can show up to an hour after the notification. Accepted, because lowering it re-fetches the earnings and dividend feeds too. Task 2 records this as a comment.
4. **"What did CPI do?" in Bull:** the tool defaults to today forward, where there are no results. The description must send Bull to a past range. Task 3 adds a routing case.
5. **Long German or French result text on a 375px phone** in the Coming up row: must wrap inside the row and not push the day label. Checked in Task 4 at mobile width.

---

### Task 1: Client-safe verdict module

Home is a client component and can't import `notification-creators.ts`, which pulls in the service-role client.

**Files:**
- Create: `lib/market-data/economic-verdict.ts`
- Modify: `lib/notifications/notification-creators.ts` (remove `economicResultText`, `EconomicResultEvent` and the local `RESULT_NOTIFY_KINDS`, then import them)
- Modify: `scripts/test-economic-verdicts.ts` (import path only)

**Interfaces:**
- Produces, from `lib/market-data/economic-verdict.ts`:
  - `export interface EconomicResultEvent { id: string; kind: EconomicKind; results: Array<{ key: string; actual: number; previous: number | null }>; verdict: 'hold' | 'raise' | 'lower' | null }`
  - `export function economicResultText(e: EconomicResultEvent): { title: NotifMsg; message?: NotifMsg } | null`, the body moved unchanged
  - `export const RESULT_KINDS_NOTIFIED: EconomicKind[] = ['fomc', 'cpi', 'jobs', 'pce', 'gdp']`
- `NotifMsg` is a type-only import from `@/lib/notifications/notifications-db`. Inline the two-line `msg` helper. Value imports allowed: `economic-kinds` only.
- `notification-creators.ts` keeps `enText` and `notifyEconomicResults`. ComingUp's `HOME_KINDS` (Task 2) is the same list, so Task 2 imports `RESULT_KINDS_NOTIFIED` instead of keeping its own copy.

- [ ] **Step 1:** Move the code and point the imports at the new module. Re-export nothing from notification-creators.
- [ ] **Step 2:** Run `npx tsx scripts/test-economic-verdicts.ts`. Expected output: `economic verdicts: ok`.
- [ ] **Step 3:** Run `npx eslint lib/market-data/economic-verdict.ts lib/notifications/notification-creators.ts`. Expected: no errors.

### Task 2: "Just released" on Home

**Files:**
- Modify: `components/dashboard/ComingUp.tsx`

**Interfaces:**
- Consumes: `economicResultText`, `RESULT_KINDS_NOTIFIED` (Task 1); `economyHref(kind)` from `economic-kinds.ts`.

Behaviour:
- `HOME_KINDS` becomes `RESULT_KINDS_NOTIFIED`.
- `describe(r)` for an economic row: if `r.event.results?.length`, compute `economicResultText({ id: r.event.id, kind: r.event.kind, results: r.event.results, verdict: r.event.verdict ?? null })`. If that returns text, render `tNav(text.title.key, text.title.vars)`. Title vars are plain numbers, so no list or date rendering is needed. `tNav` is `useTranslation('navigation').t`. Otherwise keep `homeComingEconomic`.
- Every economic row becomes a `Link` to `economyHref(kind)`, with the same classes as the stock rows. Scheduled rows link too: the page shows the next release.
- Add a comment beside the query's `staleTime`: a result can appear up to an hour after it lands (Review Focus 3).
- No new keys: the title keys exist in every locale already.

- [ ] **Step 1:** Implement the above.
- [ ] **Step 2:** Verify on localhost signed in as the QA account (`reference-qa-test-account`). Temporarily change `const from = todayET()` to `'2026-10-29'` and **revert it after**. Expected rows: "The economy grew at a 3.4% yearly pace last quarter" and "PCE inflation was 3.6% over the past year", each linking to `/tools/economy/gdp` and `/tools/economy/pce`. The future rows still say "<name> at <time>" and link to their pages.
- [ ] **Step 3 (Review Focus 1, 2):** In the same view, the rows without `results` (the future ones) are the "released but not filled" path, so step 2 already covers Focus 1. For Focus 2, `scripts/test-economic-verdicts.ts` already asserts that `economicResultText` returns null for a result missing its headline. Confirm that `describe` only uses the text when it is non-null, so such a row reads "GDP at 8:30 AM".
- [ ] **Step 4:** Revert the date, then run `npx eslint components/dashboard/ComingUp.tsx`. Expected: clean.

### Task 3: Ask Bull answers "what did CPI come in at"

**Files:**
- Modify: `lib/ai/tools.ts` (`getEconomicCalendar`, around line 2114)
- Modify: `scripts/test-bull-routing.ts` (one case)

**Interfaces:**
- Consumes: `economyHref` from `economic-kinds.ts`.

Behaviour:
- Each returned event gains `resultsPage: economyHref(e.kind)`, null for kinds without a page.
- Append to the description, as fact only: past releases carry `results` (first entry is the headline; `actual` vs `previous`), `period_label` (the month or quarter covered) and, for the Fed, `verdict` (hold, raise or lower). Units: `*_yoy`, `*_mom`, `unemployment`, `gdp` and `rate_*` are percent; `payrolls` is thousands of jobs; `claims` is a count. For "what did X come in at", pass a `from` about 45 days back. There is no forecast or consensus, so say only how it compares with the previous release. Keep the behaviour in the description; `systemPrompt.ts` must not document tools (CLAUDE.md).
- New routing case: `{ name: 'latest CPI comes from stored results', prompt: 'What did CPI come in at last month?', expectOneOf: ['getEconomicCalendar'], expectText: /\d\.\d\s?%/ }`.

- [ ] **Step 1:** Implement the above.
- [ ] **Step 2:** Run `npx eslint lib/ai/tools.ts scripts/test-bull-routing.ts`. Expected: clean.
- [ ] **Step 3:** Ask the user before spending a few cents on the routing probe. On a yes, run `npm run test-bull-routing`. Expected: the new case and the existing "next Fed meeting" case both pass.

### Task 4: "See the latest numbers" after the macro lessons

**Files:**
- Modify: `lib/market-data/economic-kinds.ts`
- Modify: `components/academy/LessonPlayer.tsx` (pass the prop at the `<LessonComplete` call, around line 184)
- Modify: `components/academy/LessonComplete.tsx` (optional prop plus a secondary link)
- Modify: `lib/i18n/locales/{en,de,es,fr,ja,no,zh}/academy.json` and their `_meta.json` files, then `npm run i18n:pseudo`
- Modify: `scripts/test-economic-verdicts.ts` (asserts for the lookup)

**Interfaces:**
- Produces, in `economic-kinds.ts`: `export function economyLinkForLesson(courseSlug: string, lessonSlug: string): string | null`. It strips a trailing `-check`, because a read and its check share one reward screen (`app/academy/[courseSlug]/[lessonSlug]/page.tsx:73`). Then it looks up `/academy/${courseSlug}/${slug}` in `{ [BIG_FOUR_LESSON]: '/tools/economy', [RATES_LESSON]: '/tools/economy/fed-rate' }`.
- `LessonComplete` gets `economyHref?: string | null`. When it is set, render a secondary text link (`lessonCompleteLatestNumbers`) beside the existing back-to-course link. It is not the primary button: the next lesson stays first.
- en copy: `"lessonCompleteLatestNumbers": "See the latest numbers"`.

- [ ] **Step 1: Write the failing asserts** in `scripts/test-economic-verdicts.ts`:

```ts
assert.equal(economyLinkForLesson('macro-basics', 'the-big-four-macro-forces'), '/tools/economy');
assert.equal(economyLinkForLesson('macro-mechanics', 'discount-rate-growth-vs-value-check'), '/tools/economy/fed-rate');
assert.equal(economyLinkForLesson('macro-basics', 'macro-basics-quiz'), null);
```

- [ ] **Step 2:** Run `npx tsx scripts/test-economic-verdicts.ts`. Expected: it fails, because `economyLinkForLesson` is not exported.
- [ ] **Step 3:** Implement the function, the prop and the link, and add the key in all 7 locales plus `_meta` and qa.
- [ ] **Step 4:** Run the script again. Expected output: `economic verdicts: ok`.
- [ ] **Step 5:** On localhost, finish `/academy/macro-basics/the-big-four-macro-forces` as the QA account. Expected: the reward screen shows "See the latest numbers" linking to `/tools/economy`, with the next lesson still the primary button. At 375px width (Review Focus 5), also check Home's Coming up with the Task 2 temporary date and the `de` locale cookie (`bp_lang=de`): rows wrap and the day label stays put.

### Task 5: Polish and close

- [ ] **Step 1:** Run `/impeccable polish components/dashboard/ComingUp.tsx` and on `components/academy/LessonComplete.tsx` (CLAUDE.md pre-ship pass for visible UI).
- [ ] **Step 2:** Run `npm run lint`. Expected: no errors (warnings allowed).
- [ ] **Step 3:** Run `npm run test-no-truncated-text`. Expected: pass (nothing new is clamped).
- [ ] **Step 4:** Update memory `project_economic_results`: phase 3 done, and note what is left as a user decision (consensus, odds, EFFR line, Pro AI explainer).
