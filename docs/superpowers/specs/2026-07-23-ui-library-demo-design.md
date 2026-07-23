# UI Library Demo (Kokonut UI + Bklit UI) — Design

## Purpose

After researching anime.js, motion.dev, Kokonut UI, Bklit UI, and manus.im as possible frontend tools, install and demo the two that actually fit BullPen's stack — Kokonut UI and Bklit UI, both built on shadcn/ui + Tailwind + Motion, same foundation BullPen already uses. Motion itself is already a dependency (it's the renamed Framer Motion). anime.js and manus.im are out of scope: anime.js duplicates what Motion already covers, and manus.im is a hosted AI agent product, not an installable library.

## Decisions confirmed with user

- **Only Kokonut UI and Bklit UI** get installed. No anime.js, no manus.im.
- **One component from each**, finance-themed:
  - Kokonut UI's `ai-prompt` (animated AI input box — thematically fits Bull, BullPen's AI assistant).
  - Bklit UI's `candlestick-chart` (directly relevant to BullPen's stock pages).
- **New unlinked dev route**, not a scratch file outside the repo — `app/dev/ui-demo/page.tsx`, reachable only by typing the URL, no nav link.
- **Static data only** — the candlestick chart gets a small hardcoded mock OHLC array, not live TwelveData. No real backend wiring for the ai-prompt component either (submit just logs to console). This is purely a visual/animation example, not a new product feature.

## Registry setup

Both libraries distribute components through the shadcn CLI's namespaced-registry mechanism. `components.json` already exists in this repo (shadcn is already initialized: style `new-york`, `rsc: true`, `cssVariables: true`) with an empty `"registries": {}` — add two entries, verified against each project's own install docs:

```json
"registries": {
  "@kokonutui": "https://kokonutui.com/r/{name}.json",
  "@bklit": "https://ui.bklit.com/r/{name}.json"
}
```

## Installation

```bash
npx shadcn@latest add @kokonutui/ai-prompt
npx shadcn@latest add @bklit/candlestick-chart
```

These commands download component source directly into the project (under whatever path each registry entry targets, typically `components/ui/`) and pull in any peer dependencies automatically — same "own your code, no vendor lock-in" model already used for BullPen's existing shadcn components. Both registries assume Motion is present, which it already is (`framer-motion` in `package.json`).

## Demo page

`app/dev/ui-demo/page.tsx` — a new, unlinked route. Server component shell containing two client-rendered sections, each clearly labeled with the library/component name so it's obvious what's being demoed:

1. **Kokonut UI — `ai-prompt`**: renders the installed component directly. Its submit handler is a no-op that `console.log`s the input — there's no real AI wiring, this section exists purely to show the component's built-in animation/interaction.
2. **Bklit UI — `candlestick-chart`**: renders the installed component fed a static mock OHLC dataset — roughly 30 fake daily candles for a fictional ticker (e.g. `"DEMO"`), defined as a plain array literal inline in the page. No TwelveData calls, no live data, no API credit cost.

## Testing / verification

This repo has no unit test framework (confirmed in the cookie-banner work earlier this session — only `tsx`-run one-off scripts exist). Verification is:
- `npm run lint` — 0 errors.
- Manual/Playwright browser check: navigate to `/dev/ui-demo`, confirm both components render without console errors, animations play, and both sections look correct in light and dark theme.

## Out of scope

- Any other Kokonut UI or Bklit UI component beyond the two named above.
- Live/TwelveData-backed candlestick data — that's a separate, real feature, not part of this demo.
- Any production surface reusing these components — if either component is later adopted into a real page, that's a new, separate design decision, not an automatic consequence of this demo existing.
- anime.js and manus.im, per user decision.
