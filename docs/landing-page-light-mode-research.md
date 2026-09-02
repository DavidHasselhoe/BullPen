# Landing Page: Should It Go Light Mode?

Research backing the question of whether BullPen's logged-out landing page (`app/page.tsx`, `components/landing/`) should move from its current dark theme to a light one. Written the same way as `docs/conversion-optimization-research.md` — evidence-first, sourced, with an explicit read of what's actually known vs. best-practice-by-default. This is a foundation for a redesign decision, not the redesign itself.

## 0. What's true today, for the record

PRODUCT.md currently names the dark theme as part of BullPen's *intentional* reference identity: "The existing landing identity (dark theme, emerald accent, Instrument Serif display type against Geist sans/mono) is the reference point." DESIGN.md's dark-by-default rule is written for the logged-in product ("the app sets `dark` on `<html>` unless a user explicitly chooses light"), but the landing page currently inherits the same dark tokens (`--bg` resolves to the same `oklch(0.145 0.008 162)` as the product's `bg-dark`).

So this isn't "fixing a bug" — dark was a deliberate choice. The question is whether it's the *right* one for a logged-out marketing surface specifically, which is a different job than the logged-in product: the landing page's only task is to convert a stranger into a signup in the first few seconds, where "does this look like a place I'd trust with my money" is doing more work than it does once someone's already a user.

## 1. The trust research is genuinely mixed — and finance-specific data leans light

This isn't a slam dunk either direction, so it's worth being honest about the split before getting to the recommendation.

**For light:**
- A dark-mode UX survey found banking/finance apps had the *lowest* dark-mode preference of any app category tested (under 50%), with qualitative responses specifically citing trust and readability concerns in professional/financial contexts.
- "Many traditional businesses still favor light mode to convey brightness, transparency, and trustworthiness — productivity or finance apps often choose light for a crisp, professional tone." White specifically reads as purity, cleanliness, and transparency in color-psychology research — literally the "nothing to hide" read that a finance app benefits from.
- Blue (not applicable to BullPen's palette, but relevant context) tests as the strongest trust color in professional-services contexts — one study found it lifts trustworthiness perception by 42%. This is *why* Chase, Barclays, and Schwab all default to blue-on-white. BullPen doesn't use blue as a primary, so this doesn't transfer directly, but it's evidence that the legacy-finance-trust palette and BullPen's dark-emerald palette are visually coded as different things.

**For dark:**
- "Darker palettes evoke luxury, sophistication, and depth, which is why fintech, entertainment, and creative tools frequently lean dark." In finance tools specifically, dark mode "can signal professionalism and focus... polished and intentional when paired with clear typography and thoughtful contrast."
- Dark mode is near-universal in the *trading-tool* register specifically (Bloomberg Terminal, TradingView, most brokerage dashboards) because dense real-time data reads better against a dark background with bright accent colors — but that's a case for the logged-in **product**, not necessarily the **marketing page** selling it.

**The actual takeaway:** the research doesn't say "dark is untrustworthy." It says dark is coded as *tech/tool/trading-desk*, and light is coded as *institutional/transparent/traditional-finance*. Which one serves BullPen better depends on which read is closer to the positioning gap — and that's answerable by looking at what PRODUCT.md already says BullPen is trying to be (see §3).

Sources: [Dark Mode vs Light Mode: UX and Visual Comfort in Mobile Applications (ResearchGate)](https://www.researchgate.net/publication/400786807_Dark_Mode_vs_Light_Mode_Impact_on_User_Experience_and_Visual_Comfort_in_Mobile_Applications), [Gapsy Studio — Dark Mode in Design: Psychological Point of View](https://gapsystudio.com/blog/dark-mode-ux/), [Bethany Works — Color Psychology for Financial Services Brands](https://bethanyworks.com/color-psychology-financial-services-brands/), [Upward Arrow — The Psychology of Blue in Marketing](https://upwardarrow.com/the-psychology-of-color-blue-in-marketing-branding/).

## 2. What actual competitors do — this is the more decisive evidence

Search snippets on this are thin (most "fintech dark mode" content is UI-dashboard-focused, not landing-page-focused), so I fetched three real competitor homepages directly instead of trusting secondhand summaries.

| Site | Theme | What it's actually doing |
|---|---|---|
| **Robinhood** (robinhood.com/eu) | **Dark** | Smoky black/gray hero photography, green CTA pill, dark nav. Closest visual sibling to BullPen's current landing page — same instinct (dark canvas, one green accent), aimed at a younger, more casual, mobile-first audience. |
| **Public.com** | **Light** | White background, large **serif** display headline ("Investing for those who take it seriously" — note: serif for the *whole* headline, not a one-word accent like BullPen's rule), black pill CTA (not colored), green used narrowly for gains inside the product screenshot (same "green = up" convention BullPen already uses). The actual **product dashboard screenshot embedded in the hero is dark** — floating in a black frame on the otherwise white page. |
| **Charles Schwab** | **Light** | White + Schwab blue, real human photography, dense utility nav with login fields on the homepage itself, "$0 commissions. 400+ branches." This is the legacy-institutional end of the spectrum — heavier, more corporate, more branch-and-phone-number coded than anything BullPen should be aiming for. |

**Public.com is the important data point here.** It's the closest comparable to BullPen in ambition and register: not Schwab's "400+ branches" legacy weight, not Robinhood's younger/gamified feel — it's explicitly positioned at "serious" investors who still want a modern product, which is functionally the same gap BullPen is trying to occupy ("institutional-grade... translated for a beginner... capable and current, not corporate-safe"). And it proves the exact pattern the user is describing: **a white, clean, professional marketing shell that still shows off a dark, data-dense, sophisticated product inside it.** The page doesn't feel "techy" despite selling a genuinely tech-forward product (AI agents, programmatic trading) — the light chrome is doing real work to make the pitch feel grounded rather than gadget-y.

## 3. Reading this against BullPen's own positioning

PRODUCT.md's anti-reference is explicit: **"Bloomberg-terminal density: dense, cryptic, jargon-heavy screens that assume professional training."** That's a dark-mode-coded aesthetic in most people's mental model — dense green/amber-on-black terminal screens are the single most common visual shorthand for "intimidating finance tool." BullPen's current landing page doesn't have that density, but it does have that *hue* — dark canvas, single accent color, monospace numerals — which is close enough to the silhouette that a first-time visitor's system-1 read could land on "trading terminal" before they've read a word of copy. That matches exactly what the user described feeling: "techy" rather than "clean and professional."

PRODUCT.md's brand personality: **"Confident, clear, modern... closer to a well-designed fintech product than a friendly consumer toy — but never intimidating."** Public.com's execution — light, spacious, one serif accent, restrained color — is a working proof that this personality survives, maybe even strengthens, on a white canvas. Nothing about "confident and modern" requires a dark background; Stripe, Public.com, and most of the current wave of "serious but not stuffy" fintech marketing sites are light.

## 4. General landing page fundamentals (theme-independent, applies either way)

These aren't new — `docs/conversion-optimization-research.md` already covers BullPen's funnel-specific findings (quiz-first signup, endowed progress, confirm-password removal) and diagnosed the landing page itself as the current bounce bottleneck (~80%+ single-page bounce on real traffic, though on very low volume — see that doc's §0 caveat). The theme decision should be evaluated inside that existing frame, not as a separate initiative:

- **5-second rule**: visitors decide to stay or leave within about 5 seconds; headline clarity and message-match matter more than any color decision. A theme change with a muddy headline won't move conversion.
- **Above-the-fold hero elements that convert**: a specific headline, a clarifying subhead, one primary CTA, one piece of social proof, and a visual that shows the actual product — all above the fold. Content above the fold gets 84% more attention than anything below it.
- **One CTA, not two of equal weight** — "two CTAs of equal weight is a tie, and ties don't convert." Worth auditing regardless of theme.
- **Named-customer-count social proof beats generic "trusted by thousands"** by a wide margin (22% lift vs. essentially 0) — specificity is what converts, not the presence of *a* trust signal.
- **A manipulable product demo beats a static screenshot**: a 38M-session study found embedded, interactive demos converting at 16.7% vs. 13.3% for static marketing pages. `docs/conversion-optimization-research.md` already flags this as the single highest-value idea for the redesign (e.g., a live "search a ticker, no account needed" widget in the hero) — this holds regardless of light or dark.

Sources: [Landingi — 25 Landing Page Best Practices for 2026](https://landingi.com/landing-page/41-best-practices/), [Digital Applied — Landing Page Conversion: 2,000 Pages Tested](https://www.digitalapplied.com/blog/landing-page-conversion-study-2000-pages-tested-2026), `docs/conversion-optimization-research.md` (internal).

## 5. Recommendation

**Worth prototyping a light variant of the hero and above-the-fold section before committing to a full revamp.** Reasoning, not just a coin flip:

1. The finance-specific trust literature leans light, and the closest-comparable direct competitor (Public.com — same "serious but modern" register BullPen is aiming for) executes light *without* looking corporate-stuffy, proving the two aren't in tension.
2. BullPen's own stated anti-reference (Bloomberg-terminal density) is visually dark-coded, and the current landing page shares enough of that silhouette (dark canvas, single accent, mono numerals) to risk the wrong first read even though the actual content isn't dense at all.
3. It doesn't require touching the product. DESIGN.md's dark-by-default rule for the logged-in app can stay exactly as-is — Public.com's own pattern (light shell, dark product screenshot inset) is a template for having both: a light, trust-first marketing page that still *shows* the sophisticated dark product as proof, rather than asking the marketing chrome itself to do double duty as a product demo.
4. Low structural risk: this is page-level (`components/landing/*`, `landing-styles.css`), isolated from the authenticated app's theme system (`ThemeProvider.tsx`, `hooks/use-background.ts`) which was just simplified to dark/light-only this session — no interaction between the two changes.

**What would need updating if this goes forward:** PRODUCT.md's Brand Personality line naming "dark theme" as part of the reference identity, and DESIGN.md's Elevation/Color sections to either scope the dark-by-default rule explicitly to product surfaces or document the landing page as a deliberate exception with its own light-mode token set.

**What to carry forward regardless of the theme decision:** the One Signal Rule (emerald/red for gain/loss only), the One Serif Word Rule (Instrument Serif stays a single accent word — note Public.com breaks this convention with a full serif headline, which is *their* signature move, not a rule to copy), and the Never-Color-Alone accessibility rule. These are identity, not palette, and should survive a light-mode pass unchanged.

## 6. Open questions for the actual revamp

- Does the light hero still lead with the interactive product demo idea from `docs/conversion-optimization-research.md` §1, or a static screenshot (Public.com's approach)? The demo-vs-static data (16.7% vs 13.3%) argues for interactive regardless of theme.
- Full-site light mode, or light landing + dark product (Public.com's model)? The latter is lower-risk and matches the existing architecture split (marketing vs. authenticated app already are separate component trees).
- New neutral-light token ramp needed for `landing-styles.css` — DESIGN.md already has light-mode tokens defined for the product (`bg-light`, `surface-light`, `border-light`, `ink-light`, `muted-light`) that could seed this rather than inventing a second light palette from scratch.
- Real traffic is still too low (per `docs/conversion-optimization-research.md` §0) to A/B test this with statistical confidence — this stays a best-practice-and-competitive-evidence call, not a data-proven one, until volume is higher.
