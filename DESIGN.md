---
name: BullPen
description: A confident, jargon-free trading desk for beginner-to-intermediate investors
colors:
  signal-emerald: "oklch(0.765 0.177 163)"
  signal-red: "oklch(0.704 0.191 22)"
  landing-accent: "oklch(0.72 0.17 152)"
  landing-accent-ink: "oklch(0.18 0.04 152)"
  info: "oklch(0.75 0.15 250)"
  warn: "oklch(0.78 0.13 80)"
  bg-dark: "oklch(0.145 0.008 162)"
  surface-dark: "oklch(0.205 0.007 162)"
  surface-2-dark: "oklch(0.269 0.006 162)"
  border-dark: "oklch(1 0 0 / 10%)"
  ink-dark: "oklch(0.985 0 0)"
  muted-dark: "oklch(0.708 0 0)"
  bg-light: "oklch(1 0 0)"
  surface-light: "oklch(0.97 0 0)"
  border-light: "oklch(0.922 0 0)"
  ink-light: "oklch(0.145 0 0)"
  muted-light: "oklch(0.556 0 0)"
typography:
  display:
    fontFamily: "var(--font-geist-sans), -apple-system, sans-serif"
    fontSize: "clamp(3rem, 8vw, 6.5rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  accent-serif:
    fontFamily: "var(--font-instrument-serif), 'Times New Roman', serif"
    fontStyle: "italic"
    fontWeight: 400
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font-geist-sans), -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "var(--font-geist-sans), -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
  numeric:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.landing-accent}"
    textColor: "{colors.landing-accent-ink}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  button-default:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.bg-dark}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: BullPen

## 1. Overview

**Creative North Star: "The Confident Ledger"**

BullPen is a calm, neutral instrument that lets one color carry all the meaning. The base system — background, surface, border, text — is a disciplined grayscale ramp, dark by default, with almost no hue of its own (the faint 162° green tint in the dark neutrals is a whisper, not a statement). Against that quiet field, Signal Emerald does double duty: it's the brand's only real accent color on the landing page, and it's the literal "your position is up" signal everywhere a number can move. Nothing competes with it. Signal Red is its mirror for the down case. Everything else — buttons, cards, inputs, nav — is built to disappear so those two colors read instantly.

This system explicitly rejects Bloomberg-terminal density: dense, cryptic, jargon-heavy screens that assume professional training. Depth of data is fine; visual noise is not. Every surface favors a small number of clearly hierarchized things over showing everything at once, and every component is built to feel precise and responsive rather than soft, bouncy, or decorative.

**Key Characteristics:**
- One brand color (Signal Emerald), spent deliberately, not spread across the UI
- Dark-by-default, disciplined grayscale neutrals with a near-imperceptible green undertone
- Geist Sans carries structure everywhere; Instrument Serif italic is reserved for a single emphasized word per marketing headline, never body copy or product UI
- Tabular, monospaced numerals wherever a price, percentage, or financial figure appears
- Flat surfaces at rest; depth is earned through interaction, not painted on by default

## 2. Colors

The palette is almost entirely achromatic — a grayscale ramp doing the structural work — with color spent only where it's meaningful: gains, losses, and the landing page's brand moment.

### Primary
- **Signal Emerald** (`oklch(0.765 0.177 163)` in product surfaces / `oklch(0.72 0.17 152)` as the landing page's tuned variant): the one color allowed to mean "good." Used for positive price/portfolio movement (`text-emerald-400` on stock and holdings surfaces), the landing hero's accent word, the primary CTA fill, and live-price pulse indicators. The two OKLCH values are intentionally close, not identical — the landing page's is hand-tuned for its glow/gradient treatment; product surfaces use Tailwind's stock `emerald-400`. Treat them as the same signal, not two colors.

### Secondary
- **Info Blue** (`oklch(0.75 0.15 250)`): status pills and neutral informational callouts (e.g. changelog "improved" tags). Used sparingly, never as a CTA color.
- **Warn Amber** (`oklch(0.78 0.13 80)`): status pills for caution/attention states, same restrained usage as Info Blue.

### Neutral
- **Ink** (`oklch(0.985 0 0)` dark / `oklch(0.145 0 0)` light): primary text.
- **Muted Ink** (`oklch(0.708 0 0)` dark / `oklch(0.556 0 0)` light): secondary text, captions, descriptions.
- **Background** (`oklch(0.145 0.008 162)` dark / `oklch(1 0 0)` light): page canvas. Dark is the default and primary experience — the app sets `dark` on `<html>` unless a user explicitly chooses light.
- **Surface** (`oklch(0.205 0.007 162)` dark / `oklch(0.97 0 0)` light): cards, popovers, dropdowns — one step off the page background.
- **Border** (`oklch(1 0 0 / 10%)` dark / `oklch(0.922 0 0)` light): the quietest possible separator; borders should almost disappear at rest and only sharpen slightly on hover.

### Named Rules
**The One Signal Rule.** Emerald and red are reserved exclusively for financial direction (gain/loss) and the landing brand accent. They never appear as decoration, illustration fill, or a third UI state color — if something needs a new color for its own sake, it's a sign the design is reaching for effect instead of clarity.

**The Never-Color-Alone Rule.** Gains and losses are never conveyed by color alone. Direction is always reinforced with an icon, sign (+/−), or label, since red-green colorblindness is common among traders — this is a stated PRODUCT.md accessibility requirement, not a nice-to-have.

## 3. Typography

**Display Font:** Geist Sans (bold, tight tracking) for structural headlines; Instrument Serif italic as a one-word emphasis accent within a headline, never as a full display face.
**Body Font:** Geist Sans
**Label/Mono Font:** Geist Mono, used specifically for numerals (`font-feature-settings: "tnum"`) — prices, percentages, tickers, and anywhere a column of numbers needs to align.

**Character:** A single confident sans (Geist) carries almost the entire interface — it reads modern and engineered, not decorative. The one deliberate departure, an italic serif dropped into a headline ("The market, *explained.*"), exists purely to make the landing page's single most important word feel considered rather than generated. It appears once per headline, never twice.

### Hierarchy
- **Display** (700, `clamp(3rem, 8vw, 6.5rem)`, line-height 0.98, tracking -0.04em): landing hero headlines only. `text-wrap: balance` keeps line breaks even.
- **Accent-serif** (400 italic, tracking -0.02em, `var(--accent)` color): the single emphasized word inside a display headline.
- **Title** (600, ~1.125rem, tight leading): card titles, section headers, modal headers.
- **Body** (400, 0.875rem, line-height 1.55): descriptions, paragraph copy. Caps at ~65-75ch measure in prose contexts.
- **Label** (500, 0.75rem): form labels, stat labels, badges — occasionally uppercase with wide tracking for status pills only, never as a default section eyebrow.
- **Numeric** (Geist Mono, tabular figures): every price, percentage, and financial statistic. This is a hard rule, not a style preference — misaligned numeral widths undermine the "confident ledger" feel immediately.

### Named Rules
**The One Serif Word Rule.** Instrument Serif italic appears on exactly one emphasized word per headline, on marketing surfaces only. It is never used for body copy, UI chrome, or product-surface headings — the product register stays entirely in Geist Sans.

**The Tabular Numerals Rule.** Any rendered price, percentage, delta, or financial statistic uses Geist Mono with tabular figures. Proportional numerals in a price are a bug, not a style choice.

## 4. Elevation

Flat by default. Cards sit on a one-step-lighter surface with a barely-visible border (`border-border/60`, ~10% white in dark mode) and a near-invisible `shadow-sm` — depth is not painted on at rest. On hover, cards respond: the border sharpens slightly, the shadow deepens to `shadow-md`, and (where used) the card lifts `-2px`. The landing page's primary CTA is the one deliberate exception — it carries a genuine glow shadow at rest, because a single glowing CTA earns its emphasis precisely because nothing else on the page glows.

### Shadow Vocabulary
- **Resting card** (`shadow-sm`, border `oklch(1 0 0 / 10%)`): the default state for every card/container. Reads as barely-there.
- **Hover card** (`shadow-md` + `shadow-black/20`, border sharpened to full opacity, `translateY(-2px)`, 200ms ease): the interactive response, not the default.
- **CTA glow** (`0 12px 32px -10px var(--accent-glow), inset 0 1px 0 oklch(1 0 0 / 0.3)`): reserved for the landing page's single primary CTA button. Not for product-surface buttons.

### Named Rules
**The Earned-Depth Rule.** Shadows exist to answer "what happens when I touch this," not to decorate a surface at rest. If a shadow is visible before any interaction and it isn't the landing CTA, it's wrong.

## 5. Components

### Buttons
Two distinct button languages by register, and that split is intentional, not an inconsistency.
- **Product buttons** (`rounded-md`, 8px): compact, `h-9` default height, tight `active:scale-[0.97]` press feedback, 150-200ms transitions. Variants: `default` (solid ink-colored fill), `outline`, `secondary`, `ghost`, `link`, `destructive`. Feel: precise and responsive — fast, engineered feedback with no bounce.
- **Landing CTA buttons** (`rounded-full`, pill, 999px): looser and more physical — `translateY(-1px)` lift on hover, `translateY(1px) scale(0.99)` on press, a continuous subtle shimmer sweep on the primary variant, genuine glow shadow. This is the one place BullPen allows itself to feel a little showy, because it's a single, rare, top-of-funnel moment.

### Cards / Containers
- **Corner Style:** `rounded-xl` (14px) for cards; `rounded-md` (8px) for inputs and buttons; `rounded-full` reserved for pills and the landing CTA.
- **Background:** Surface neutral, one step off page background.
- **Shadow Strategy:** see Elevation — flat at rest, `shadow-md` + lift on hover.
- **Border:** `border-border/60` at rest, full `border-border` on hover.
- **Internal Padding:** 24px (`py-6`, `px-6` on header/content/footer).

### Inputs / Fields
- **Style:** `rounded-md`, `border-input`, `bg-background`, `shadow-sm`, 150ms transitions.
- **Focus:** border shifts to `ring` color, 2px focus ring at 30% opacity, background tints to `muted/20` — a soft, unmistakable focus state without a harsh outline.
- **Error / Disabled:** `aria-invalid` drives a destructive-colored border + ring; disabled drops to 50% opacity with `cursor-not-allowed`.

### Navigation
Sidebar/top nav uses the same neutral surface tokens as cards (`--sidebar`, one step off background), with active/hover states driven by the same `accent`/`accent-foreground` pair used for interactive product chrome — never the emerald signal color, which stays reserved for financial meaning.

### Signature Component: The Serif Accent Headline
The landing page's defining move: a bold Geist Sans headline with exactly one word swapped into italic Instrument Serif, colored in Signal Emerald (`"The market, *explained.*"`). It's the single most identity-carrying detail in the whole system — worth protecting from dilution (don't add a second serif word, don't use it outside marketing headlines).

## 6. Do's and Don'ts

### Do:
- **Do** spend Signal Emerald / Signal Red only on financial direction (gains/losses) and the one landing brand moment — everything else stays neutral.
- **Do** pair every gain/loss color with an icon, sign, or label — never color alone (PRODUCT.md accessibility requirement).
- **Do** render every price, percentage, and financial statistic in Geist Mono with tabular figures.
- **Do** keep cards and containers flat at rest; let `shadow-md` + hover lift be the only depth cue.
- **Do** use `rounded-full` pills only for the landing CTA and status pills — `rounded-md`/`rounded-xl` everywhere else.
- **Do** use the italic Instrument Serif accent for at most one word per marketing headline.
- **Do** put explanatory/methodology copy (how a number is calculated, disclaimers, "how this works") behind an `Accordion` (`components/ui/accordion.tsx`), collapsed by default. A reader who wants the detail opens the row that answers their actual question; everyone else sees one line, not a paragraph.

### Don't:
- **Don't** build Bloomberg-terminal density — dense, cryptic, jargon-heavy screens that assume professional training. This is BullPen's named anti-reference from PRODUCT.md; every screen should favor a small number of clearly hierarchized things over showing everything at once.
- **Don't** render several paragraphs of always-visible explanatory text as a grid of static cards — it reads as clutter no matter how cleanly each card is styled. If it takes more than 2-3 sentences to explain, it belongs in a collapsed accordion (see the Do above), not a wall of always-on prose.
- **Don't** use `border-left`/`border-right` colored stripes as a card or list-item accent.
- **Don't** apply `background-clip: text` gradient text for emphasis — use Signal Emerald or weight/size instead.
- **Don't** introduce a third "meaningful" UI color beyond Signal Emerald/Red — Info Blue and Warn Amber are for status pills only, not general accents.
- **Don't** use Instrument Serif for body copy, UI chrome, or more than one word in a headline.
- **Don't** paint a visible shadow on a surface at rest outside the landing CTA — depth is earned on hover, not decorative.
- **Don't** let the landing hero's `clamp(48px, 8vw, 104px)` display size grow further — it already sits above the general 6rem/96px display ceiling; treat that as the outer bound, not a floor to build on.
