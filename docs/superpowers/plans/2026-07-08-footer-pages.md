# Footer Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build seven new standalone marketing/legal pages (About, Contact, Roadmap, Help Center, Glossary, Disclosures, Security) and remove seven dead footer links (Careers, API docs, Press kit, Partners, Data sources, Blog, Status).

**Architecture:** Every new page is a Next.js Server Component following the exact pattern already proven by `app/privacy/page.tsx` and `app/changelog/page.tsx`: wrapped in `.bullpen-landing-root`, same minimal header (Logo + back-to-home link), shared `Footer`, content in a `<main className="wrap">`. Static-content pages (About, Disclosures, Security, Help Center, Glossary) reuse the existing `.legal-doc` CSS class (already styles `h1/h2/h3/p/ul/li/a` generically, not just Termly-specific markup) — zero new CSS needed. Roadmap reuses the existing `.changelog-*` CSS classes. Only Contact needs new UI (a form) and new backend (a Supabase table + a rate-limited API route that stores the submission and emails a notification via Resend).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role server client), Resend (`lib/email/resend.ts`), existing rate-limit helper (`lib/security/api-security.ts`'s `withRateLimit`).

## Global Constraints

- No test framework in this repo — every task's verification is `npm run lint` (0 errors; warnings acceptable) plus a dev-server + `curl` check.
- Never create feature branches — all commits go directly to `preview`.
- When staging changes, use exact file paths (`git add <path> <path>`) — never `git add -A` or `git add .`. This repository's working tree may contain unrelated in-progress work from other sessions that must not be touched.
- New Supabase migrations must be applied immediately via the Supabase MCP (`mcp__claude_ai_Supabase__apply_migration`), not just committed as a file. Project ID: `kgqpzuvhslqazurfrqya`.
- All new UI must live inside `.bullpen-landing-root` and use its existing CSS custom properties (`--fg`, `--fg-muted`, `--fg-dim`, `--border`, `--accent`, `--accent-soft`, `--bg`, `--bg-2`, `--surface`) — never hardcoded colors.
- Server-side Supabase access uses `createServerClient()` from `@/lib/supabase/client` (service role — bypasses RLS). Client-side/browser code never touches the `contact_submissions` table directly.
- Footer link removal means deleting the `<li>`/array entry entirely, not just leaving a dead `#anchor`.

---

### Task 1: Footer link cleanup

**Files:**
- Modify: `components/landing/Footer.tsx`

**Interfaces:**
- Produces: the final `COLUMNS` array shape that all later tasks' pages are linked from (`/about`, `/contact`, `/roadmap`, `/help`, `/glossary`, `/disclosures`, `/security`).

- [ ] **Step 1: Replace the COLUMNS array**

In `components/landing/Footer.tsx`, replace the existing `COLUMNS` array (lines 6-49):

```tsx
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Daily Brief', href: '#daily-brief' },
      { label: 'BullPen AI', href: '#bullpen-ai' },
      { label: 'Screener', href: '#screener' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help center', href: '#help-center' },
      { label: 'API docs', href: '#api-docs' },
      { label: 'Blog', href: '#blog' },
      { label: 'Glossary', href: '#glossary' },
      { label: 'Status', href: '#status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#about' },
      { label: 'Careers', href: '#careers' },
      { label: 'Press kit', href: '#press-kit' },
      { label: 'Contact', href: '#contact' },
      { label: 'Partners', href: '#partners' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '#terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Disclosures', href: '#disclosures' },
      { label: 'Data sources', href: '#data-sources' },
      { label: 'Security', href: '#security' },
    ],
  },
];
```

with:

```tsx
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Daily Brief', href: '#daily-brief' },
      { label: 'BullPen AI', href: '#bullpen-ai' },
      { label: 'Screener', href: '#screener' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help center', href: '/help' },
      { label: 'Glossary', href: '/glossary' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '#terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Disclosures', href: '/disclosures' },
      { label: 'Security', href: '/security' },
    ],
  },
];
```

- [ ] **Step 2: Lint check**

Run: `npx eslint components/landing/Footer.tsx`
Expected: `0 problems`

- [ ] **Step 3: Verify in the dev server**

```bash
npm run dev &
sleep 6
curl -s http://localhost:3000/ | grep -o 'href="/about"'
curl -s http://localhost:3000/ | grep -o 'href="/contact"'
curl -s http://localhost:3000/ | grep -o 'href="/roadmap"'
curl -s http://localhost:3000/ | grep -o 'href="/help"'
curl -s http://localhost:3000/ | grep -o 'href="/glossary"'
curl -s http://localhost:3000/ | grep -o 'href="/disclosures"'
curl -s http://localhost:3000/ | grep -o 'href="/security"'
curl -s http://localhost:3000/ | grep -c "Careers"
curl -s http://localhost:3000/ | grep -c "API docs"
curl -s http://localhost:3000/ | grep -c "Press kit"
curl -s http://localhost:3000/ | grep -c "Partners"
curl -s http://localhost:3000/ | grep -c "Data sources"
curl -s http://localhost:3000/ | grep -c "Blog"
curl -s http://localhost:3000/ | grep -c ">Status<"
```
Expected: the seven `href` greps each print a match; the seven `grep -c` counts for removed links each print `0`.

- [ ] **Step 4: Stop the dev server**

Windows: `taskkill //F //IM node.exe //T`
(There is no `pkill` in this environment's bash — use `taskkill` instead.)

- [ ] **Step 5: Commit**

```bash
git add components/landing/Footer.tsx
git commit -m "feat(footer): remove dead links, wire remaining ones to real routes"
git push origin preview
```

---

### Task 2: About, Disclosures, and Security pages

**Files:**
- Create: `app/about/page.tsx`
- Create: `app/disclosures/page.tsx`
- Create: `app/security/page.tsx`

**Interfaces:**
- Consumes: `Logo` from `@/components/landing/Atoms`, `Footer` from `@/components/landing/Footer`, `.legal-doc` CSS class from `@/components/landing/landing-styles.css` (already exists — no new CSS).
- Produces: `/about`, `/disclosures`, `/security` routes.

These three pages share an identical shell; only the content inside `.legal-doc` differs. Each is a separate file (no shared page component) since Next.js App Router pages must be one file per route, but keeping them as one task is right since a reviewer evaluates all three together (same pattern, same review pass).

- [ ] **Step 1: Create the About page**

Create `app/about/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'About — BullPen',
  description: 'What BullPen is, who it\'s for, and who builds it.',
};

export default function AboutPage() {
  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>About BullPen</h1>
            <p>
              BullPen is an investment research and portfolio-tracking platform for everyday investors.
              It provides stock, ETF, crypto, and market data; company financials; AI-powered analysis,
              explanations, and a research assistant; price and earnings alerts; watchlists; portfolio
              tracking with optional brokerage-account connection; and educational tools and social
              features.
            </p>
            <h2>Who it&apos;s for</h2>
            <p>
              BullPen is built for beginners who don&apos;t want to stay beginners — people who want
              real financial data and honest explanations, not jargon, and who want to actually
              understand what they&apos;re looking at rather than just being told what to think.
            </p>
            <h2>Who builds it</h2>
            <p>
              BullPen is built and operated by Hasselø Bullpen, a sole proprietorship (enkeltpersonforetak)
              registered in Norway.
            </p>
            <p>
              Have a question we haven&apos;t answered? <Link href="/contact">Get in touch</Link>.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Disclosures page**

Create `app/disclosures/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Disclosures — BullPen',
  description: 'Important disclosures about BullPen\'s data, AI features, and brokerage connections.',
};

export default function DisclosuresPage() {
  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>Disclosures</h1>

            <h2>Not investment advice</h2>
            <p>
              BullPen is not a registered investment advisor. Content on this platform — including
              stock data, health scores, AI-generated analysis, and educational material — is
              informational only and does not constitute financial, investment, tax, or legal advice.
              Nothing on BullPen should be relied upon as a recommendation to buy, sell, or hold any
              security.
            </p>

            <h2>AI-generated content</h2>
            <p>
              Some content on BullPen — including the AI research assistant, &quot;Why Today?&quot;
              price explanations, Daily Brief summaries, portfolio risk analysis, and AI Deep Dive
              reports — is generated by AI models. AI-generated content may be incomplete or contain
              errors, and should always be verified against primary sources before you rely on it for
              any decision.
            </p>

            <h2>Brokerage connections</h2>
            <p>
              When you connect a brokerage account through SnapTrade, the connection is read-only:
              BullPen never receives your brokerage login credentials, and neither BullPen nor
              SnapTrade can place trades, transfer funds, or take any other action on your brokerage
              account. We only receive account balance and holdings data to power your dashboard.
            </p>

            <h2>Market data</h2>
            <p>
              Market data is delayed up to 15 seconds on the Free plan. Data is provided by third-party
              vendors and, while we work with reputable providers, we cannot guarantee its accuracy or
              completeness.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the Security page**

Create `app/security/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Security — BullPen',
  description: 'How BullPen protects your data.',
};

export default function SecurityPage() {
  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>Security</h1>
            <p>
              We take protecting your data seriously. Here&apos;s what&apos;s actually in place —
              not just a policy statement, but real, verifiable measures.
            </p>

            <h2>Data access controls</h2>
            <p>
              Every table in our database enforces Row Level Security, scoping data access strictly
              to its owning user. Our privileged database key is never exposed to the browser —
              it&apos;s used only in server-side code.
            </p>

            <h2>Application security</h2>
            <p>
              Every request passes through security headers (Content-Security-Policy, X-Frame-Options,
              X-Content-Type-Options, and more) and rate limiting to reduce abuse. All traffic runs over
              HTTPS, and scheduled jobs are protected by a bearer-token secret.
            </p>

            <h2>Brokerage connections</h2>
            <p>
              Our brokerage integration partner, SnapTrade, is SOC 2 Type II certified. Connections use
              OAuth — BullPen never sees or stores your brokerage login credentials. See our{' '}
              <Link href="/disclosures">Disclosures</Link> page for more on how brokerage connections work.
            </p>

            <h2>Found a security issue?</h2>
            <p>
              If you believe you&apos;ve found a security vulnerability, please{' '}
              <Link href="/contact">contact us</Link> directly rather than disclosing it publicly. We
              take reports seriously and will respond as quickly as we can.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lint check**

Run: `npx eslint app/about/page.tsx app/disclosures/page.tsx app/security/page.tsx`
Expected: `0 problems`

- [ ] **Step 5: Verify in the dev server**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/about
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/disclosures
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/security
curl -s http://localhost:3000/about | grep -o "About BullPen"
curl -s http://localhost:3000/disclosures | grep -o "Not investment advice"
curl -s http://localhost:3000/security | grep -o "Row Level Security"
taskkill //F //IM node.exe //T
```
Expected: three `200` responses, and each grep prints a match.

- [ ] **Step 6: Commit**

```bash
git add app/about/page.tsx app/disclosures/page.tsx app/security/page.tsx
git commit -m "feat(pages): add About, Disclosures, and Security pages"
git push origin preview
```

---

### Task 3: Help Center page (reuses FAQ content)

**Files:**
- Modify: `components/landing/FAQ.tsx`
- Create: `app/help/page.tsx`

**Interfaces:**
- Consumes: `FAQ_ITEMS` exported from `components/landing/FAQ.tsx` (shape: `{ q: string; a: string }[]`).
- Produces: `/help` route.

- [ ] **Step 1: Export FAQ_ITEMS and fix the stale contact email**

In `components/landing/FAQ.tsx`, the array is currently declared as:

```tsx
const FAQ_ITEMS = [
```

Change to:

```tsx
export const FAQ_ITEMS = [
```

Then, later in the same file, find:

```tsx
            <a href="mailto:hello@bullpen.app" className="btn btn-ghost" style={{ fontSize: 14, padding: '11px 18px' }}>
              <Icon name="chat" size={14} />
              Chat with the team
            </a>
```

Replace with (there's now a real Contact page to link to, instead of a stale placeholder email address that was never a real working inbox):

```tsx
            <Link href="/contact" className="btn btn-ghost" style={{ fontSize: 14, padding: '11px 18px' }}>
              <Icon name="chat" size={14} />
              Chat with the team
            </Link>
```

Add the `Link` import at the top of the file (alongside the existing imports):

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';
```

- [ ] **Step 2: Create the Help Center page**

Create `app/help/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { FAQ_ITEMS } from '@/components/landing/FAQ';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Help Center — BullPen',
  description: 'Answers to common questions about BullPen.',
};

export default function HelpCenterPage() {
  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>Help Center</h1>
            <p>Answers to the questions we hear most.</p>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
            <p>
              Didn&apos;t find what you were looking for? <Link href="/contact">Contact us</Link>.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint check**

Run: `npx eslint components/landing/FAQ.tsx app/help/page.tsx`
Expected: `0 problems`

- [ ] **Step 4: Verify in the dev server**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/help
curl -s http://localhost:3000/help | grep -o "Is BullPen actually free?"
curl -s http://localhost:3000/ | grep -o 'href="/contact"' | head -1
taskkill //F //IM node.exe //T
```
Expected: `200`, a match for the FAQ question, and at least one `/contact` link found on the homepage (confirms the FAQ CTA now points at the real page).

- [ ] **Step 5: Commit**

```bash
git add components/landing/FAQ.tsx app/help/page.tsx
git commit -m "feat(pages): add Help Center, reusing real FAQ content"
git push origin preview
```

---

### Task 4: Glossary page

**Files:**
- Create: `app/glossary/page.tsx`

**Interfaces:**
- Consumes: `GLOSSARY` exported from `@/lib/finance/glossary` (shape: `Record<string, { plainLabel: string; description: string }>`, 50 existing entries).
- Produces: `/glossary` route.

- [ ] **Step 1: Create the Glossary page**

Create `app/glossary/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { GLOSSARY } from '@/lib/finance/glossary';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Glossary — BullPen',
  description: 'Plain-English explanations of financial terms used throughout BullPen.',
};

export default function GlossaryPage() {
  const entries = Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div className="legal-doc">
            <h1>Glossary</h1>
            <p>
              Plain-English explanations of the financial terms you&apos;ll see throughout BullPen —
              the same ones behind every tooltip in the app.
            </p>
            {entries.map(([term, entry]) => (
              <div key={term}>
                <h3>
                  {term} <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}>— {entry.plainLabel}</span>
                </h3>
                <p>{entry.description}</p>
              </div>
            ))}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

Run: `npx eslint app/glossary/page.tsx`
Expected: `0 problems`

- [ ] **Step 3: Verify in the dev server**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/glossary
curl -s http://localhost:3000/glossary | grep -o "Company Size"
taskkill //F //IM node.exe //T
```
Expected: `200`, and a match (the `plainLabel` for "Market Cap").

- [ ] **Step 4: Commit**

```bash
git add app/glossary/page.tsx
git commit -m "feat(pages): add Glossary page, reusing existing glossary data"
git push origin preview
```

---

### Task 5: Roadmap page

**Files:**
- Create: `content/roadmap.json`
- Create: `app/roadmap/page.tsx`

**Interfaces:**
- Produces: a JSON file matching `{ date: string; text: string }[]` (real, git-history-derived milestones) and the `/roadmap` route.
- Consumes: the existing `.changelog-date-group`, `.changelog-date`, `.changelog-items`, `.changelog-item`, `.changelog-pill`, `.changelog-pill--new` CSS classes from `components/landing/landing-styles.css` (already exist from the Changelog feature — no new CSS).

- [ ] **Step 1: Create the roadmap history data file**

Create `content/roadmap.json` with real milestones compiled from git history (each date is the actual month a feature shipped, verified via `git log`):

```json
[
  { "date": "2026-07", "text": "Redesigned onboarding with a starter holdings picker" },
  { "date": "2026-07", "text": "AI assistant added directly to the stock chart" },
  { "date": "2026-07", "text": "Brokerage connection management, including the ability to disconnect" },
  { "date": "2026-07", "text": "Starter watchlist templates (FAANG, semiconductors, and more)" },
  { "date": "2026-07", "text": "Pro subscriptions launched" },
  { "date": "2026-06", "text": "Mobile redesign, in-app notifications, and a daily portfolio recap" },
  { "date": "2026-06", "text": "Fully customizable, advanced stock charts" },
  { "date": "2026-06", "text": "Academy learning mode with gamification" },
  { "date": "2026-06", "text": "Screener rebuilt on a full S&P 1500 database, with health scores and CSV import" },
  { "date": "2026-05", "text": "Redesigned Portfolio Risk Analysis" },
  { "date": "2026-05", "text": "AI Deep Dive — analyst-grade AI stock reports" },
  { "date": "2026-05", "text": "User-defined price and metric alerts" },
  { "date": "2026-05", "text": "Self-healing company logos, so every ticker shows a real logo" },
  { "date": "2026-01", "text": "BullPen development began" }
]
```

- [ ] **Step 2: Validate the JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('content/roadmap.json', 'utf-8')); console.log('valid')"`
Expected output: `valid`

- [ ] **Step 3: Create the Roadmap page**

Create `app/roadmap/page.tsx`:

```tsx
import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Roadmap — BullPen',
  description: "Where BullPen has been, and what's next.",
};

interface HistoryEntry {
  date: string;
  text: string;
}

function readRoadmapHistory(): HistoryEntry[] {
  const filePath = path.join(process.cwd(), 'content', 'roadmap.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HistoryEntry[];
}

function formatMonth(isoMonth: string): string {
  return new Date(`${isoMonth}-01T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export default function RoadmapPage() {
  const history = readRoadmapHistory();

  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Roadmap</h1>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>Where we&apos;ve been, and what&apos;s next.</p>

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '20px 24px',
              marginBottom: 48,
              maxWidth: 640,
              marginLeft: 'auto',
              marginRight: 'auto',
              background: 'var(--bg-2)',
            }}
          >
            <strong>What&apos;s next</strong>
            <p style={{ color: 'var(--fg-muted)', margin: '8px 0 0' }}>
              We&apos;re still scoping the public roadmap — check back soon.
            </p>
          </div>

          <div className="changelog-list">
            {history.map((entry, i) => (
              <div className="changelog-date-group" key={i}>
                <div className="changelog-date">{formatMonth(entry.date)}</div>
                <div className="changelog-items">
                  <div className="changelog-item">
                    <span className="changelog-pill changelog-pill--new">Shipped</span>
                    <span>{entry.text}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lint check**

Run: `npx eslint app/roadmap/page.tsx`
Expected: `0 problems`

- [ ] **Step 5: Verify in the dev server**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/roadmap
curl -s http://localhost:3000/roadmap | grep -o "BullPen development began"
curl -s http://localhost:3000/roadmap | grep -o "changelog-pill--new"
taskkill //F //IM node.exe //T
```
Expected: `200`, and both greps print a match.

- [ ] **Step 6: Commit**

```bash
git add content/roadmap.json app/roadmap/page.tsx
git commit -m "feat(pages): add Roadmap page with real shipped-history data"
git push origin preview
```

---

### Task 6: Contact — database table and API route

**Files:**
- Create: `supabase/migrations/076_contact_submissions.sql`
- Create: `app/api/contact/route.ts`

**Interfaces:**
- Produces: a `contact_submissions` Supabase table (`id uuid`, `name text`, `email text`, `message text`, `created_at timestamptz`), and a `POST /api/contact` endpoint accepting `{ name: string; email: string; message: string }`, returning `{ success: true }` (201) or `{ success: false, error: string }` (400/429/500).

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/076_contact_submissions.sql`:

```sql
-- Contact form submissions
-- Written only by the /api/contact route via the service-role server client.
-- RLS is enabled with NO policies at all: zero anon/authenticated access by
-- design. Reads happen via direct Supabase dashboard/SQL access, not the app.

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Call the `mcp__claude_ai_Supabase__apply_migration` tool with:
- `project_id`: `kgqpzuvhslqazurfrqya`
- `name`: `076_contact_submissions`
- `query`: the exact SQL from Step 1

Verify it applied by calling `mcp__claude_ai_Supabase__list_tables` (or `execute_sql` with `select 1 from public.contact_submissions limit 0;`) and confirming `contact_submissions` exists with no errors.

- [ ] **Step 3: Create the API route**

Create `app/api/contact/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

async function handler(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!name || name.length > MAX_NAME_LENGTH) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Please enter a valid name.' }, { status: 400 })
    );
  }
  if (!email || !EMAIL_RE.test(email)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
    );
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Please enter a message.' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('contact_submissions').insert({ name, email, message });

  if (error) {
    console.error('[contact] insert failed:', error.message);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
    );
  }

  // Fire-and-forget — a failed notification email must never lose the stored submission.
  sendEmail({
    to: 'david@hasselo.no',
    subject: `New contact form submission from ${name}`,
    html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message.replace(/\n/g, '<br>')}</p>`,
  }).catch((err) => {
    console.error('[contact] notification email failed:', err instanceof Error ? err.message : err);
  });

  return addSecurityHeaders(NextResponse.json({ success: true }, { status: 201 }));
}

export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 5, scope: 'contact' });
```

- [ ] **Step 4: Lint check**

Run: `npx eslint app/api/contact/route.ts`
Expected: `0 problems`

- [ ] **Step 5: Verify against the live database**

```bash
npm run dev &
sleep 6
curl -s -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","message":"This is a test submission from the implementation plan."}'
```
Expected: `{"success":true}`.

Then verify the row landed in Supabase — call `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select name, email, message from public.contact_submissions where email = 'test@example.com';
```
Expected: one row matching the test submission. Then delete it so it doesn't linger as test data:
```sql
delete from public.contact_submissions where email = 'test@example.com';
```

Also verify validation rejects bad input:
```bash
curl -s -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"","email":"not-an-email","message":""}'
```
Expected: `{"success":false,"error":"Please enter a valid name."}` (first failing field wins).

```bash
taskkill //F //IM node.exe //T
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/076_contact_submissions.sql app/api/contact/route.ts
git commit -m "feat(contact): add contact_submissions table and rate-limited API route"
git push origin preview
```

---

### Task 7: Contact page (form UI)

**Files:**
- Create: `app/contact/page.tsx`
- Create: `components/landing/ContactForm.tsx`

**Interfaces:**
- Consumes: `POST /api/contact` from Task 6 (request body `{ name, email, message }`, response `{ success: true }` or `{ success: false, error: string }`).
- Produces: the `/contact` route.

- [ ] **Step 1: Create the form component**

Create `components/landing/ContactForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent, type CSSProperties } from 'react';
import { Icon } from './Icon';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontSize: 15,
  fontFamily: 'inherit',
};

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '32px',
          textAlign: 'center',
          background: 'var(--bg-2)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 99,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="check" size={22} stroke={2.2} />
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Message sent</p>
        <p style={{ color: 'var(--fg-muted)', fontSize: 14 }}>Thanks for reaching out — we&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="contact-name" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="contact-email" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="contact-message" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--down)', fontSize: 14 }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={status === 'submitting'} style={{ alignSelf: 'flex-start' }}>
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the Contact page**

Create `app/contact/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { ContactForm } from '@/components/landing/ContactForm';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Contact — BullPen',
  description: 'Get in touch with the BullPen team.',
};

export default function ContactPage() {
  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <h1 style={{ fontSize: 32, marginBottom: 8 }}>Contact</h1>
            <p style={{ color: 'var(--fg-muted)', marginBottom: 32 }}>
              Questions, feedback, or something broken? Send us a message.
            </p>
            <ContactForm />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint check**

Run: `npx eslint components/landing/ContactForm.tsx app/contact/page.tsx`
Expected: `0 problems`

- [ ] **Step 4: Verify end-to-end in the dev server**

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contact
curl -s http://localhost:3000/contact | grep -o "Send message"
taskkill //F //IM node.exe //T
```
Expected: `200`, and a match for the submit button text.

This confirms the page renders; the full submit → API → Supabase → email flow was already verified end-to-end in Task 6, Step 5 by calling the API route directly.

- [ ] **Step 5: Commit**

```bash
git add components/landing/ContactForm.tsx app/contact/page.tsx
git commit -m "feat(contact): add /contact page with working form"
git push origin preview
```

---

## Final verification (run after all seven tasks are complete)

```bash
npm run lint
```
Expected: 0 errors (warnings acceptable, per this repo's existing baseline).

```bash
npm run dev &
sleep 6
for route in / /about /contact /roadmap /help /glossary /disclosures /security; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$route")
  echo "$route -> $code"
done
taskkill //F //IM node.exe //T
```
Expected: every route returns `200`.
