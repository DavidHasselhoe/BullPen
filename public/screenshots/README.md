# Landing page screenshots

Real captures of the running app, in **light mode** to match the light landing
page. The landing page's bento (`components/landing/Benefits.tsx`) uses the
`bento-*.png` pairs below; `/upgrade` uses `bento-why` and `bento-brief` with their `-dark` twins (2x, shown at 568px).

Each bento shot is one card of the real app, taken twice from the app's own
responsive layout so neither is a shrunken desktop screen:

- `bento-<name>.png`: a 600px viewport at 2x, a 568px-wide card (1136px file),
  shown at 568px in the desktop bento.
- `bento-<name>-m.png`: a 360px viewport at 3x, a 328px-wide card (984px file),
  shown at 328px on phones through `<picture>`.

`Benefits.tsx` holds each shot's CSS size and an optional `y` that scrolls a
tall capture to the moment the copy talks about. A retake that changes a card's
height needs its `h` (and maybe `y`) updated there.

## Files

| File | What it shows | Used by |
|---|---|---|
| `bento-plain-english(-m).png` | `/stock/NVDA` `#nav-statistics` (Key Numbers), beginner mode | Landing |
| `bento-health(-m).png` | `/stock/NVDA` `#nav-health` (Financial Health) | Landing |
| `bento-watchlist(-m).png` | `/watchlist` scorecard strip | Landing |
| `bento-economy(-m).png` | `/tools/economy` result cards | Landing |
| `bento-academy(-m).png` | `/academy` Daily Challenge card | Landing |
| `bento-daily-brief(-m).png` | `/dashboard` "Daily brief" section | Landing |
| `bento-why.png` / `-dark` | `/stock/MU` price card down to the Why reason, a recreated day (see below), 568x331 CSS, 1136x662 file | `/upgrade` |
| `bento-brief.png` / `-dark` | `/dashboard` "Daily brief" section, 568x233 CSS, 1136x466 file | `/upgrade` |

## How to re-take the bento

1. Set the QA account up (memory `reference-qa-test-account`), noting the old
   values to restore: `settings.theme = 'light'`, `experience_level =
   'beginner'` (so the plain labels show). Stay on the **free** plan: the page
   sells the free plan.
2. Sign it in on the Playwright MCP and save the session with
   `context.storageState({ path })`.
3. Point `STATE` in `scripts/capture-landing-screenshots.js` at that file and
   run the script with the MCP's run_code tool (`filename` = the script). It
   hides the dev overlay, Ask Bull, the cookie banner and the phone tab bar,
   freezes animation, and writes all twelve files.
4. Restore the account's settings.

Check every capture by eye before committing: no QA name, no half-loaded
skeletons, no number that only makes sense for the test account.

### `bento-why`: a recreated day

The sample has to name a real catalyst ("no company news today" sells
nothing), and today rarely has a cached one. So the shot recreates a real past
day instead: MU on 2026-11-13, its real close ($778.31, -$20.13, -2.52%) and
the real cached answer from `whytoday:v2:2026-11-13:en:MU`, written right after
that close at -2.55%. Shot the next trading morning before the open, when the
snapshot quote is still that close, at a 600px viewport and 2x, with Playwright
`page.route` serving the old answer to `/api/stock/MU/why-today-cached`,
`{ success: true, data: null }` to `/extended-hours` and aborting
`/api/market/prices**` (the glob must reach `/stream`: the live SSE price is the
pre-market tick and replaces the close). Expand the answer's Show more and hide
its Show less before shooting. Both themes come from one signed-in page by
toggling the `dark` class on `<html>`, so the account's theme needn't change.
Pick an answer generated after the close: one written mid-session carries a
different move than the close (AVGO and AMD on 11-13 did), and the app rightly
hides it.
Never pair an answer with a different day's price, and never write an answer
by hand: every word in it should be something the app really said about that
day. The landing hero no longer needs this: it shows real cached answers live
(`/api/market/landing-why`).
