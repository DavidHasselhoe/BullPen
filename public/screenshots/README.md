# Landing page screenshots

Real captures of the running app. Two sections use them, and no capture is used
by both:

- **`Peek.tsx`** — the whole-app tour, shown in browser chrome with a tab strip.
  It reads this folder through `lib/landing/screenshots.ts`, which **silently
  skips any file that is missing**, so tabs can be added one at a time and the
  section omits itself entirely if none exist.
- **`Features.tsx`** — one capture per headline feature, beside its copy. These
  are referenced directly, with no existence check: they are committed
  alongside the component, so a missing file there is a broken image, not an
  empty section.

## Expected files

| File | Route / state to capture | Used by |
|---|---|---|
| `dashboard.png` | `/dashboard`, scrolled to the Daily Brief + Market Context band | Peek — "Dashboard" |
| `stock-detail.png` | `/stock/NVDA` top of page | Peek — "Stock page" |
| `discover.png` | `/discover`, scrolled to Weekly Pick + Market Pulse | Peek — "Discover" |
| `screener.png` | `/tools/screener` top of page | Peek — "Screener" |
| `holdings.png` | `/holdings` top of page | Peek — "Holdings" |
| `why-today.png` | `/stock/<ticker>` with the **Why Today?** panel open | Features |
| `daily-brief.png` | `/dashboard` with the Daily Brief modal open | Features |
| `ai-chat.png` | `/tools/ai-chat` with one answered question on screen | Features |
| `institutions.png` | `/discover`, scrolled to Institutional Holdings | Features |

## Capture settings

- **Viewport `1600 x 1000`.** Any 16:10 viewport works (`why-today.png` is
  1920x1200 because the stock page's side panel squeezes the top nav at 1600 —
  see below), but the aspect ratio must stay 16:10 or the Peek tab strip jumps
  height as you switch tabs.
- **Dark theme.** The app is dark by default and the landing page is light, so
  the captures read as screens rather than as part of the page. Do not switch
  the app to light to match the landing page.
- Capture the **content area only** — `Peek` draws its own browser chrome
  (traffic lights + URL bar), so a shot including a real browser frame looks
  doubled.
- **Hide the floating Ask Bull launcher** before capturing. It sits over the
  bottom-right corner and clips whatever card is under it, which reads as a
  rendering bug in a still image:
  ```js
  document.head.insertAdjacentHTML('beforeend',
    '<style>[class*="fixed"][class*="bottom-"][class*="right-"]{display:none!important}</style>');
  ```
- Let live data finish loading. Empty skeletons photograph badly, and the
  holdings page in particular can 429 on first load with a large portfolio
  (10 simultaneous `MAX`-range candle requests) — reload and re-check that the
  position count and allocation are complete before you keep the shot.

## Before you commit a capture

These ship publicly to every visitor, so check each one for:

- Real account balances or position sizes you would rather not publish
- Your email address, display name or avatar in the nav
- Anything in a notification tray or daily brief that names a real person

The current set was taken on the QA test account (see the project's Claude
memory), temporarily promoted to Pro, with a seeded 10-position portfolio.
That is the easiest way to avoid all of the above.
