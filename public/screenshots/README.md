# Landing page screenshots

Real captures of the running app, in **light mode** to match the light landing
page (David's call, 2026-10-02: the old dark captures read as black slabs on a
white page and were too small to read). Two sections use them, and no capture
is used by both:

- **`Benefits.tsx`** — the bento. Each `bento-*.png` is cropped to one moment
  (a single card or section), and peeks in from the card's corner. Referenced
  directly; a missing file is a broken image.
- **`Peek.tsx`** — the tour, in browser chrome with a tab strip. Reads this
  folder through `lib/landing/screenshots.ts`, which skips missing files.
  `tour-academy.png` is the exception: the bento uses it, so the tour leaves
  Academy out.

## Files

| File | What it shows | Used by |
|---|---|---|
| `bento-plain-english.png` | `/stock/NVDA` `#nav-statistics` (Key Numbers), beginner mode | Benefits |
| `bento-health.png` | `/stock/NVDA` `#nav-health` (Financial Health) | Benefits |
| `bento-portfolio.png` | `/dashboard` "Your portfolio" section | Benefits |
| `bento-why.png` | `/stock/VST` price card (YTD range) down to the expanded Why reason, a recreated day (see below) | Benefits, `/upgrade` (light) |
| `bento-why-dark.png` | Same shot in dark mode, same size and crop (568x316) | `/upgrade` (dark) |
| `bento-brief.png` | `/dashboard` "Daily brief" section | Benefits, `/upgrade` (light) |
| `bento-brief-dark.png` | Same shot in dark mode, same size and crop (568x231) | `/upgrade` (dark) |
| `tour-academy.png` | `/academy`, below the nav | Benefits |
| `tour-stock.png` | `/stock/NVDA`, below the nav | Peek |
| `tour-discover.png` | `/discover`, below the nav | Peek |
| `tour-screener.png` | `/tools/screener`, below the nav | Peek |
| `tour-holdings.png` | `/holdings`, below the nav | Peek |

## How to re-take them

Use the QA account (see memory `reference-qa-test-account`) against the dev
server, through the Playwright browser tool.

1. Set the account up for the shot, and note the old values to restore:
   `settings.theme = 'light'`, `experience_level = 'beginner'` (so the plain
   labels show). Stay on the **free** plan: the page sells the free plan, and
   with Pro, Home generates a paid Why Today answer for every 2%+ mover.
2. Pick a Why Today ticker that is already cached today
   (`whytoday:v2:<date>:en:<TICKER>` in Redis), so nothing is generated.
3. Viewport `1280 x 800` for `tour-*`. The two upgrade-page bentos (`bento-brief`, `bento-why`) are 568px wide, which is a
   **600px-wide** viewport (600 minus the 16px gutters): `bento-brief` clips 568x231 from the Daily brief
   `<section>`'s top-left, `bento-why` clips 568x316 from the price card's top-left (its rounded border included), down to the reason.
   Clip a fixed size rather than shooting the element, whose fractional height rounds to 232. Take the `-dark`
   twin with `settings.theme = 'dark'` and the exact same clip. Hide `nextjs-portal` and `button[title="Ask Bull"]`
   with an injected style. Element shots for `bento-*`; for `tour-*` clip
   `{ x: 0, y: 64, width: 1280, height: 736 }` to drop the app nav.
4. Wait for live data before shooting: Holdings shows a partial total while a
   quote is still loading ("across 9 positions" instead of 10).
5. Restore the account's settings.

### `bento-why`: a recreated day

The sample has to name a real catalyst ("no company news today" sells
nothing), and today rarely has a cached one. So the shot recreates a real past
day instead: VST on 2026-10-13, its real close ($162.36, +$4.23 from $158.13)
and the real cached answer from `whytoday:v2:2026-10-13:en:VST`. Shot the next
morning before the open, when the snapshot quote is still that close, with
Playwright `page.route` serving the old answer to `/api/stock/VST/why-today-cached`,
`{ success: true, data: null }` to `/extended-hours` (or the pre-market move
replaces the close and hides the answer) and aborting `/api/market/prices`.
"Show more" clicked, then the toggle, the indicator chip row and the app header hidden: at 568x316 it just fits the landing card's 300px cap at 540 wide. Never pair an
answer with a different day's price, and never write an answer by hand: every
word in it should be something the app really said about that day.

Check every capture by eye before committing: no QA name, no half-loaded
skeletons, no number that only makes sense for the test account.
