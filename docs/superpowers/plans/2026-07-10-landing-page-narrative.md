# Landing Page Narrative Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the BullPen marketing landing page (`app/page.tsx` / `components/landing/**`) so "BullPen explains the market to you — on demand and every morning" (Why Today + Daily Brief) is the single, unmistakable pitch, demoting the rest of the feature grid to supporting proof.

**Architecture:** Pure presentational/copy changes to existing React components inside `components/landing/`. No new files, no new API routes, no backend changes. Reuses the landing page's existing `useLiveQuotes` hook (`/api/market/landing-quotes`) for the one live data point in the redesigned hero.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, inline CSS-in-JS style objects (this codebase's landing page convention — see any existing component in `components/landing/`), scoped CSS in `components/landing/landing-styles.css` under the `.bullpen-landing-root` namespace.

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-07-10-landing-page-narrative-design.md` — read it before starting if anything below is ambiguous.
- No unit test framework covers these components (this repo has none for React/TSX — see CLAUDE.md). Each task's "test cycle" below is: `npm run lint` (0 errors required, warnings acceptable) + `npm run build` (must succeed) + a Playwright visual check of the rendered page. There is no `npm test` step to run.
- Apply `.agents/skills/ui-ux-pro-max/SKILL.md` guidelines while building — CLAUDE.md requires this for all frontend work (contrast, animation timing 150–300ms, reduced-motion support already handled globally in `landing-styles.css`, touch targets).
- The landing page is dark-only by design (`.bullpen-landing-root.dark` in `LandingClient.tsx`) — do not add light-mode variants.
- Follow existing code conventions exactly: inline `style={{...}}` objects (not Tailwind classes) for landing components, `Reveal`/`SectionHeading` from `./Atoms` for scroll-in animation and section headers, CSS custom properties (`var(--accent)`, `var(--fg)`, etc.) never hardcoded colors.
- Section IDs (`#top`, `#features`, `#how`, `#peek`, `#pricing`, `#faq`) and `LandingClient.tsx`'s section order are NOT touched — `Nav.tsx` anchors depend on them.
- Run `/impeccable polish app/page.tsx` as the final step (Task 4) before considering this shippable — required by CLAUDE.md for landing-page visual work.
- Out of scope, do not touch: onboarding wizard (doesn't exist, not being added), `app/dashboard/page.tsx`, social/leaderboard gating, `Nav.tsx`, `TickerStrip.tsx`, `Testimonials.tsx`, `Pricing.tsx`, `FAQ.tsx`, `Footer.tsx`.

---

### Task 1: Hero — new copy + two-card visual

**Files:**
- Modify: `components/landing/Hero.tsx`
- Modify: `components/landing/landing-styles.css:293-304`

**Interfaces:**
- Consumes: `useLiveQuotes()` (already defined in this file, unchanged), `Icon` from `./Icon` (needs `'sparkles'` and `'bolt'` — both already valid `IconName` values used elsewhere in `components/landing/Features.tsx`), `Reveal` from `./Atoms`, `buildPath` from `./buildPath` (import removed — no longer used in this file after this task).
- Produces: nothing consumed by other tasks — Hero is a leaf component in the tree.

- [ ] **Step 1: Remove `HeroChart` and `FloatingTicker` and their usages**

In `components/landing/Hero.tsx`, delete these in full:
- The entire `HeroChart` function (from `// ── Hero chart ──` comment through its closing `}`).
- The entire `FloatingTicker` function and its `FloatingTickerProps` interface (from `// ── Floating mini ticker card ──` comment through its closing `}`).
- The `import { buildPath } from './buildPath';` line — no longer used anywhere in this file once the above are removed.

Keep everything else in the file: the top-of-file imports (`Reveal`, `Icon`), the `LiveQuote` interface, `fmtPrice`, and `useLiveQuotes` all stay exactly as-is.

- [ ] **Step 2: Add the two new hero-visual card components**

Add these two functions where `HeroChart` used to be (same location in the file, replacing it):

```tsx
// ── Why Today card ──────────────────────────────────────────────────────────
function WhyTodayCard() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 30px 80px -30px oklch(0 0 0 / 0.5), 0 0 0 1px var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 280,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon name="sparkles" size={12} />
        Why Today?
      </div>

      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
        }}
      >
        Why did NVDA jump 4.2% today?
      </div>

      <div
        style={{
          maxWidth: '92%',
          padding: '14px 16px',
          borderRadius: 14,
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          fontSize: 13,
          color: 'var(--fg)',
          lineHeight: 1.55,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          NVDA gained <strong>4.21% to $892.40</strong> on three catalysts:
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--fg-muted)' }}>
          <li>Leaked Blackwell GPU benchmarks beat H100 by 2.3×</li>
          <li>Morgan Stanley raised PT to $1,100</li>
          <li>Sector rotation back into AI names</li>
        </ol>
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Reuters', 'Bloomberg', 'MS Research'].map((s) => (
            <span
              key={s}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 99,
                border: '1px solid var(--border)',
                color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Daily Brief card ──────────────────────────────────────────────────────────
function DailyBriefCard({ liveQuote }: { liveQuote?: LiveQuote }) {
  const today = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    []
  );
  // liveQuote.pct already carries its own sign and '%' (see useLiveQuotes mapping below) —
  // do not prepend another sign here.
  const priceLine = liveQuote ? `AAPL ${liveQuote.pct}` : 'AAPL +1.5%';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 30px 80px -30px oklch(0 0 0 / 0.5), 0 0 0 1px var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 280,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="bolt" size={12} />
          Daily Brief
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: 'var(--up)',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            textTransform: 'none',
            letterSpacing: 'normal',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: 'var(--up)',
              animation: 'bp-pulse-dot 1.6s ease-in-out infinite',
            }}
          />
          {today} · 6:30 AM
        </span>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
        Good morning. Markets steady before CPI.
      </div>

      <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
        Your watchlist is <span style={{ color: 'var(--up)', fontWeight: 600 }}>up 1.2% premarket</span>.{' '}
        <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{priceLine}</span> leads after a broker upgrade. Fed minutes drop at 2PM ET.
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { l: 'AAPL', v: liveQuote?.pct ?? '+1.5%', up: liveQuote?.up ?? true },
          { l: 'NVDA', v: '+2.1%', up: true },
          { l: 'TSLA', v: '-0.4%', up: false },
        ].map((m) => (
          <span
            key={m.l}
            className="mono"
            style={{
              fontSize: 10,
              padding: '3px 7px',
              borderRadius: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontWeight: 600,
              color: 'var(--fg)',
            }}
          >
            {m.l} <span style={{ color: m.up ? 'var(--up)' : 'var(--down)' }}>{m.v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

Note: `useMemo` must be in this file's React import — check the top of `Hero.tsx`; it currently imports `{ useEffect, useMemo, useState, type CSSProperties }` from `'react'`, so `useMemo` is already available. No import change needed for this step.

- [ ] **Step 3: Replace the hero visual + pill badge + headline + subhead in the `Hero` component**

Replace the pill badge content (the `Reveal` block containing "New" + "Daily Brief — your AI market summary, every morning"):

```tsx
<Reveal>
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 14px 6px 8px',
      borderRadius: 999,
      background: 'var(--surface)',
      border: '1px solid oklch(from var(--accent) l c h / 0.3)',
      fontSize: 13,
      color: 'var(--fg-muted)',
      margin: '0 auto 28px',
      boxShadow: '0 0 24px -10px var(--accent-glow)',
    }}
  >
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 99,
        background: 'var(--accent)',
        color: 'var(--accent-ink)',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      New
    </span>
    Why Today? Ask any stock why it moved, get an answer with sources
    <Icon name="arrowRight" size={14} />
  </div>
</Reveal>
```

Replace the headline `<h1>`:

```tsx
<Reveal delay={1}>
  <h1 className="headline" style={{ margin: 0, fontSize: 'clamp(48px, 8vw, 104px)', color: 'var(--fg)' }}>
    The market,{' '}
    <span className="accent-serif" style={{ color: 'var(--accent)' }}>
      explained.
    </span>
  </h1>
</Reveal>
```

Replace the subhead `<p>`:

```tsx
<Reveal delay={2}>
  <p
    style={{
      margin: '28px auto 0',
      fontSize: 'clamp(17px, 1.6vw, 20px)',
      lineHeight: 1.55,
      color: 'var(--fg-muted)',
      maxWidth: 640,
      textWrap: 'pretty',
    }}
  >
    Ask why any stock moved and get a real answer — sources included. Every morning, a Daily Brief tells you before you ask. Built for investors who want to understand, not just watch.
  </p>
</Reveal>
```

Leave the CTA buttons block (`Start for free` / `or explore the dashboard →`) and the trust-badges block (`No card required` / `Free forever plan` / `10,000+ tickers`) exactly as they are — no changes there.

Replace the entire hero-visual `Reveal delay={5}` block (the one currently containing the glow div, `HeroChart`, and the `float-tickers` div) with:

```tsx
<Reveal delay={5}>
  <div style={{ position: 'relative', maxWidth: 1040, margin: '64px auto 0' }}>
    <div
      style={{
        position: 'absolute',
        inset: -40,
        background: 'radial-gradient(50% 50% at 50% 50%, var(--accent-glow), transparent 70%)',
        filter: 'blur(40px)',
        opacity: 0.5,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
    <div
      className="hero-duo"
      style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
    >
      <WhyTodayCard />
      <DailyBriefCard liveQuote={liveQuotes['AAPL']} />
    </div>
  </div>
</Reveal>
```

Leave the "Powered by best-in-class data" `Reveal delay={6}` block at the bottom of `Hero` unchanged.

- [ ] **Step 4: Add mobile stacking CSS for `.hero-duo`, remove now-dead `.float-tickers` rule**

In `components/landing/landing-styles.css`, find this block (around line 302-304):

```css
@media (max-width: 800px) {
  .bullpen-landing-root .float-tickers > div > div { display: none !important; }
}
```

Delete it — `.float-tickers` is no longer rendered anywhere after Step 1/3. Replace it with:

```css
@media (max-width: 700px) {
  .bullpen-landing-root .hero-duo { grid-template-columns: 1fr !important; }
}
```

(This uses the same `700px` breakpoint already established for `.wrap` and `.pricing-grid` elsewhere in this file, per existing convention.)

- [ ] **Step 5: Verify — lint, build, visual check**

Run:
```bash
npm run lint
```
Expected: 0 errors (pre-existing warnings elsewhere in the codebase are fine; there must be no new warnings/errors from `Hero.tsx` — specifically watch for `no-unused-vars` on `buildPath`, `HeroChart`, `FloatingTicker`, `FloatingTickerProps` if any weren't fully removed).

Run:
```bash
npm run build
```
Expected: build succeeds.

Then start the dev server and view the page:
```bash
npm run dev
```
Use Playwright to navigate to `http://localhost:3000` and take a screenshot at desktop width (1440px) and mobile width (390px). Confirm:
- The pill badge reads "New — Why Today? Ask any stock why it moved, get an answer with sources"
- Headline reads "The market, *explained.*" with "explained." in the accent serif italic style
- Two cards ("Why Today?" and "Daily Brief") render side by side at desktop width, stacked vertically at 390px width
- No floating ticker cards remain
- No console errors

- [ ] **Step 6: Commit**

```bash
git add components/landing/Hero.tsx components/landing/landing-styles.css
git commit -m "feat: rework landing hero around Why Today + Daily Brief"
```

---

### Task 2: Features — restructure grid around the promoted duo

**Files:**
- Modify: `components/landing/Features.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (independent file).
- Produces: nothing consumed by other tasks — `Features` is a leaf component.

- [ ] **Step 1: Add a `compact` prop to `FeatureCard`**

Replace the `FeatureCard` function's signature and style block:

```tsx
function FeatureCard({
  children,
  accent = false,
  compact = false,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  compact?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: accent
          ? 'linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--surface)'
          : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 22,
        padding: compact ? 20 : 28,
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 200ms, transform 240ms cubic-bezier(.22,1,.36,1), box-shadow 240ms',
        minHeight: compact ? 240 : 320,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = '0 20px 50px -20px oklch(0 0 0 / 0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {children}
    </div>
  );
}
```

(Only the props signature and the `padding`/`minHeight` lines changed from ternaries on `compact`; everything else in this function is identical to the current version.)

- [ ] **Step 2: Update the BullPen AI card copy and promote Daily Brief into the top row**

Replace the `SectionHeading` call at the top of `export function Features()`:

```tsx
<SectionHeading
  eyebrow="The core of BullPen"
  title={
    <>
      Two ways to always{' '}
      <span className="accent-serif" style={{ color: 'var(--accent)' }}>
        know why.
      </span>
    </>
  }
  sub="Ask any stock why it moved, or let a Daily Brief tell you before you ask. Everything else is here to help once you're in."
/>
```

Replace the `feat-grid` div's contents entirely with this new structure (promoted duo row, a plain-text label, then the demoted row):

```tsx
<div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 18 }}>
  <Reveal delay={1} style={{ gridColumn: 'span 7' }}>
    <FeatureCard accent>
      <FeatureKicker icon="sparkles" label="Why Today?" />
      <FeatureTitle>Ask why any stock moved. Get an answer with sources.</FeatureTitle>
      <FeatureDesc>
        A research assistant that knows your portfolio, reads filings, and explains moves in plain English — always with the receipts.
      </FeatureDesc>
      <ChatVisual />
    </FeatureCard>
  </Reveal>

  <Reveal delay={2} style={{ gridColumn: 'span 5' }}>
    <FeatureCard accent>
      <FeatureKicker icon="bolt" label="Daily Brief" />
      <FeatureTitle>Your market summary, every morning at 6:30.</FeatureTitle>
      <FeatureDesc>Personalized to what you hold and watch — written by Claude.</FeatureDesc>
      <BriefVisual />
    </FeatureCard>
  </Reveal>
</div>

<Reveal delay={1}>
  <div
    style={{
      margin: '56px 0 20px',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--fg-dim)',
      letterSpacing: '0.02em',
    }}
  >
    And once you&apos;re in, the rest of the toolkit:
  </div>
</Reveal>

<div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 18 }}>
  <Reveal delay={2} style={{ gridColumn: 'span 4' }}>
    <FeatureCard compact>
      <FeatureKicker icon="chart" label="Real-time charts" />
      <FeatureTitle>TradingView-grade candles, indicators, alerts.</FeatureTitle>
      <FeatureDesc>8 timeframes from 1D to ALL. Overlay SMA, EMA, Bollinger Bands, RSI, MACD.</FeatureDesc>
      <CandleVisual />
    </FeatureCard>
  </Reveal>

  <Reveal delay={2} style={{ gridColumn: 'span 4' }}>
    <FeatureCard compact>
      <FeatureKicker icon="pie" label="Portfolio" />
      <FeatureTitle>Holdings, P&amp;L, and risk in one view.</FeatureTitle>
      <FeatureDesc>Link a brokerage or track manually. Sector breakdown and diversification score included.</FeatureDesc>
      <PortfolioVisual />
    </FeatureCard>
  </Reveal>

  <Reveal delay={3} style={{ gridColumn: 'span 4' }}>
    <FeatureCard compact>
      <FeatureKicker icon="search" label="Screener" />
      <FeatureTitle>Find tomorrow&apos;s winners with the filters you trust.</FeatureTitle>
      <FeatureDesc>Stack filters on revenue, margins, EPS, debt-to-equity, ROE, and yield.</FeatureDesc>
      <ScreenerVisual />
    </FeatureCard>
  </Reveal>

  <Reveal delay={2} style={{ gridColumn: 'span 12' }}>
    <FeatureCard compact>
      <FeatureKicker icon="shield" label="Alerts & filings" />
      <FeatureTitle>Never miss a 10-K, an earnings beat, or a 5% move.</FeatureTitle>
      <FeatureDesc>Email alerts on SEC filings, insider trades, earnings, and price thresholds.</FeatureDesc>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { icon: 'bell' as const, t: 'AAPL filed 10-Q', s: 'Q3 revenue beat by 2.1%', up: true },
          { icon: 'arrowUp' as const, t: 'NVDA moved +5.2%', s: 'On Blackwell benchmark leak', up: true },
          { icon: 'bolt' as const, t: 'TSLA earnings tomorrow', s: 'Consensus EPS: $0.62', up: null },
        ].map((a, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: a.up ? 'oklch(from var(--up) l c h / 0.15)' : 'var(--surface-2)',
                color: a.up ? 'var(--up)' : 'var(--fg-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={a.icon} size={13} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{a.t}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.s}</div>
            </div>
          </div>
        ))}
      </div>
    </FeatureCard>
  </Reveal>
</div>
```

Note the `feat-grid` responsive rule at `landing-styles.css:298` (`.feat-grid > div { grid-column: span 12 !important; }` under `max-width: 900px`) applies to `> div` children of any element with class `feat-grid` — since this task now has **two** `feat-grid` divs (promoted row + demoted row), that CSS rule still applies correctly to both without changes, because it targets the class, not a specific instance.

The `CandleVisual` card's `span` changed from `5` to `4` — no code change needed inside `CandleVisual` itself, its SVG already renders at `width="100%"` so it reflows correctly at the narrower column.

- [ ] **Step 2: Verify — lint, build, visual check**

Run:
```bash
npm run lint
```
Expected: 0 errors.

Run:
```bash
npm run build
```
Expected: build succeeds.

With the dev server running, use Playwright to navigate to `http://localhost:3000#features` (or scroll to the Features section) and screenshot at desktop and mobile widths. Confirm:
- Section heading reads "The core of BullPen" / "Two ways to always *know why.*"
- Top row shows "Why Today?" (span 7) and "Daily Brief" (span 5) side by side, both with the accent gradient background
- A plain-text label "And once you're in, the rest of the toolkit:" appears below
- Charts / Portfolio / Screener render as a 3-up compact row, Alerts spans full width below them
- At mobile width, all cards stack to full width (existing `900px` breakpoint rule)

- [ ] **Step 3: Commit**

```bash
git add components/landing/Features.tsx
git commit -m "feat: promote Why Today + Daily Brief in landing Features grid"
```

---

### Task 3: HowItWorks, Peek, FinalCTA — copy and ordering tweaks

**Files:**
- Modify: `components/landing/HowItWorks.tsx`
- Modify: `components/landing/Peek.tsx`
- Modify: `components/landing/FinalCTA.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (three independent files).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: HowItWorks — update step 2's description**

In `components/landing/HowItWorks.tsx`, inside the `STEPS` array, find the object with `n: '02'`. Change only its `desc` field:

```tsx
{
    n: '02',
    icon: 'plus',
    title: 'Build your watchlist',
    desc: 'Search 10,000+ stocks, ETFs, crypto, and commodities — then ask BullPen AI why any of them just moved.',
    visual: (
      // ...unchanged, keep exactly as it is today
    ),
},
```

Do not touch the `visual` field or the `n: '01'` / `n: '03'` entries.

- [ ] **Step 2: Peek — reorder VIEWS so the AI demo is first**

In `components/landing/Peek.tsx`, replace the `VIEWS` array:

```tsx
const VIEWS = [
  { id: 'ai', label: 'BullPen AI', url: '/tools/ai', Component: AiChatView },
  { id: 'stock', label: 'Stock detail', url: '/stock/AAPL', Component: StockDetailView },
  { id: 'screener', label: 'Screener', url: '/tools/screener', Component: () => <ScreenshotView src="/screenshots/screener.png" alt="BullPen stock screener" /> },
  { id: 'portfolio', label: 'Portfolio', url: '/holdings', Component: PortfolioView },
  { id: 'dashboard', label: 'Dashboard', url: '/dashboard', Component: () => <ScreenshotView src="/screenshots/dashboard.png" alt="BullPen dashboard" /> },
];
```

This is a pure reorder of the same five objects (only `'ai'` moved from index 2 to index 0) — no other code in `Peek.tsx` changes, since the component already indexes purely by array position (`VIEWS[idx]`).

- [ ] **Step 3: FinalCTA — update headline and subhead**

In `components/landing/FinalCTA.tsx`, replace the `<h2>` and the `<p>` immediately following it:

```tsx
<h2 className="headline" style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 64px)', color: 'var(--fg)' }}>
  Ready to know{' '}
  <span className="accent-serif" style={{ color: 'var(--accent)' }}>
    why?
  </span>
</h2>
<p style={{ margin: '20px 0 32px', fontSize: 18, lineHeight: 1.55, color: 'var(--fg-muted)', maxWidth: 540, textWrap: 'pretty' }}>
  Sign up free in 30 seconds. No credit card. Connect your brokerage later — or never. Start understanding today.
</p>
```

Leave the button/trust-badges block below it unchanged.

- [ ] **Step 4: Verify — lint, build, visual check**

Run:
```bash
npm run lint
```
Expected: 0 errors.

Run:
```bash
npm run build
```
Expected: build succeeds.

With the dev server running, use Playwright to scroll through the full page. Confirm:
- HowItWorks step 2 card reads the new description (visual card content itself is unchanged — only the text above it)
- Peek section opens by default on the "BullPen AI" tab (showing the "Why did NVDA jump 4.2%?" reasoning demo) instead of "Screener"
- FinalCTA headline reads "Ready to know *why?*" and the subhead ends in "Start understanding today."

- [ ] **Step 5: Commit**

```bash
git add components/landing/HowItWorks.tsx components/landing/Peek.tsx components/landing/FinalCTA.tsx
git commit -m "feat: align HowItWorks/Peek/FinalCTA copy with new landing narrative"
```

---

### Task 4: Full-page verification and polish pass

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Full lint + build**

```bash
npm run lint
```
Expected: 0 errors (same warning count as before this plan started — no new warnings introduced across all three tasks).

```bash
npm run build
```
Expected: build succeeds with no new errors or warnings related to `components/landing/`.

- [ ] **Step 2: Full-page Playwright walkthrough**

With the dev server running (`npm run dev`), use Playwright to navigate to `http://localhost:3000` and:
1. Screenshot at desktop width (1440px), scrolling through: Hero → TickerStrip → Features → HowItWorks → Peek → Testimonials → Pricing → FAQ → FinalCTA → Footer.
2. Screenshot at mobile width (390px), same scroll pass.
3. Confirm zero browser console errors on either pass.
4. Confirm the "Start for free" CTA in the hero still opens the signup modal (click it, verify `AuthModal` opens) — this flow is untouched by the plan but must not have regressed.
5. Confirm `Nav.tsx`'s "Features" / "How it works" / "Pricing" / "FAQ" links still scroll to the correct sections (anchors unchanged, but verify visually since section content shifted).

- [ ] **Step 3: Run the pre-ship polish pass**

Per CLAUDE.md, run:
```
/impeccable polish app/page.tsx
```
Address anything it flags on the changed surfaces (Hero, Features, HowItWorks, Peek, FinalCTA) before considering this done.

- [ ] **Step 4: Final commit (if polish pass made changes)**

```bash
git add -A
git commit -m "polish: landing page narrative redesign pre-ship pass"
```

If the polish pass made no changes, skip this step — nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** All six spec sections (Hero, TickerStrip [unchanged, confirmed], Features, HowItWorks, Peek, Testimonials/Pricing/FAQ/Footer [unchanged, confirmed], FinalCTA) are covered by Tasks 1-3. The spec's verification plan (lint, build, Playwright, `/impeccable polish`) is covered by Task 4.
- **Type consistency:** `WhyTodayCard` and `DailyBriefCard` (Task 1) both live in and are only used within `Hero.tsx` — no cross-file signature to keep consistent. `LiveQuote` interface is unchanged from the existing file, so `DailyBriefCard({ liveQuote }: { liveQuote?: LiveQuote })` matches `useLiveQuotes()`'s existing return type exactly. `FeatureCard`'s new `compact` prop defaults to `false`, so the two promoted-row call sites (which don't pass it) render identically to today's non-compact styling.
- **Corrected bug caught during planning:** an early draft of `DailyBriefCard` prepended a `+` sign to `liveQuote.pct`, which already contains its own sign (see `useLiveQuotes`'s mapping: `` pct: `${q.dp >= 0 ? '+' : ''}${q.dp.toFixed(2)}%` ``). Fixed in Task 1 Step 2's code to use `liveQuote.pct` directly.
