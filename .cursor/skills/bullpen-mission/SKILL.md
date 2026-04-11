---
name: bullpen-mission
description: BullPen app mission and design principles. Apply when building any UI component, page, or feature — especially data-heavy stock/financial screens. Enforces the all-levels UX system and experience_level adaptive design pattern.
---

# BullPen Mission & Design Principles

## The Mission

BullPen is a financial market analyzer for **users of any skill level** — from someone who has never bought a stock to a seasoned trader. The goal is to teach users how to read companies, find investment ideas, and become informed investors.

**Not another Bloomberg terminal.** There are plenty of platforms for advanced traders. BullPen's edge is that it meets every user where they are.

---

## The Core Problem to Solve

A first-time investor opening the stock detail page should not see a wall of jargon (P/E, EV/EBITDA, Short Ratio, MACD) and close the tab. They should see **the same data presented in plain language** — and gradually learn what terms mean as their confidence grows.

**We never remove data. We adapt how it is presented.**

---

## The Experience Level System

Every user has an `experience_level` in the DB: `'beginner' | 'intermediate' | 'advanced'` (nullable → treat as `'intermediate'`).

- **Beginner (Simple mode)**: Plain English labels, tooltips explaining terms, reduced clutter, key takeaways emphasized
- **Intermediate / Advanced (Pro mode)**: Full jargon labels, all metrics, technical indicators — current behavior

### How to use it in code

```ts
import { useExperienceLevel } from '@/hooks/use-experience-level';

const { isSimplified } = useExperienceLevel();
// isSimplified === true when experience_level === 'beginner'
```

The toggle is a **Simple | Pro pill** in the stock detail page header. Users can also set it in Settings.

---

## Design Principles

### 1. Adaptive, not dumbed-down
Never remove information in simple mode. Instead: use plain labels, add explanatory tooltips, and surface the most important 20% of data first. Power users can always expand.

### 2. Tooltips everywhere on jargon terms
Use `<TermTooltip term="P/E (TTM)" />` (from `components/ui/TermTooltip.tsx`) anywhere a financial term appears. In simple mode it shows the plain label. In pro mode it adds a hoverable `?` explanation.

### 3. Plain language first, technical second
When writing a label or description:
- Bad: "EV/EBITDA"
- Good: "Company Value vs Profit" (with "EV/EBITDA" in the tooltip)

The glossary lives in `lib/finance/glossary.ts` — always add new terms there.

### 4. Progressive disclosure
- Show the 3-5 most important metrics first (highlighted)
- Provide an expander / "Show more" for the full breakdown
- Never require scrolling past a wall of numbers to find the key insight

### 5. Mobile-first, whitespace matters
Dense data grids are intimidating. Use generous padding, clear section headers, and visual hierarchy. Every section should have a clear heading that tells the user what they'll learn from it.

### 6. Consistent sections on stock detail page
When adding a new section, ask:
- Does it appear in both simple and pro mode? (usually yes, adapted)
- Does it have a plain-English section title?
- Does it have a one-sentence description of what the user learns from it?

---

## What NOT to do

- Do not ship a new data-heavy component without a `isSimplified` adaptation
- Do not add a metric/stat label without adding it to `GLOSSARY` in `lib/finance/glossary.ts`
- Do not use abbreviations in simple mode (P/E, EPS, TTM, EV, EBITDA, SMA, RSI, MACD, BB)
- Do not build features that only serve advanced users without a simplified path

---

## Checklist before shipping a UI component

- [ ] Would a 22-year-old with no investing experience understand this in simple mode?
- [ ] Are all financial terms wrapped in `<TermTooltip>`?
- [ ] Are the most important 2-3 data points visually highlighted?
- [ ] Is there a "Show more / full breakdown" path for advanced users?
- [ ] Does the component respect `useExperienceLevel().isSimplified`?
