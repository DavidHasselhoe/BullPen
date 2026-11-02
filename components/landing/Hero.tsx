'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Icon } from './Icon';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import { slugToAssetPath, symbolToSlug } from '@/lib/assets/asset-type';
import { WHY_TODAY_MIN_MOVE } from '@/lib/ai/why-today-shared';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { trackEvent } from '@/lib/analytics/track';
import type { LandingWhyPayload } from '@/app/api/market/landing-why/route';

interface Props {
  onSignUp: () => void;
}

// ── Rotating topic ───────────────────────────────────────────────────────────
// What BullPen explains, in a cap-height chip with a dot (the shape of
// notion.com's hero word). It sits alone on the second line so nothing else
// moves when its width eases to the next word. One pass, then it rests on the
// first word: a loop would never stop moving (WCAG 2.2.2), and reduced motion
// never starts. The visible word is real text, so crawlers and screen readers
// get "Finally understand the market" rather than every word at once.
const TOPICS = ['the market', 'your stocks', 'earnings day', 'the Fed', 'P/E ratios', 'the market'];
const TOPIC_MS = 2200;

function RotatingTopic() {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setIndex((n) => {
        if (n + 1 >= TOPICS.length - 1) clearInterval(id);
        return Math.min(n + 1, TOPICS.length - 1);
      });
    }, TOPIC_MS);
    return () => clearInterval(id);
  }, []);

  // Each word measures itself on mount (and again if the font swaps in late),
  // and the label eases to that width.
  const measure = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <span className="hero-topic">
      <span className="hero-topic-dot" aria-hidden />
      <span className="hero-topic-label" style={width != null ? { width } : undefined}>
        <span key={index} ref={measure} className="hero-topic-word">
          {TOPICS[index]}
        </span>
      </span>
    </span>
  );
}

// ── Stock search ─────────────────────────────────────────────────────────────
// The fastest way to see the product: every stock page works signed out.
function HeroSearch() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { results, isLoading } = useInstantSearch(query, 6);
  const shown = query.trim() ? results : [];
  // Two characters is when the server search joins in; before that an empty list means 'keep typing'.
  const noMatch = query.trim().length >= 2 && !isLoading && shown.length === 0;
  const boxRef = useRef<HTMLDivElement>(null);

  const go = (ticker: string, instrumentType?: string) => {
    trackEvent('landing_search_used', { ticker });
    router.push(slugToAssetPath(ticker, instrumentType));
  };

  return (
    <div
      ref={boxRef}
      className="hero-search"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Icon name="search" size={17} className="hero-search-icon" />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-label="Look up any stock"
        placeholder="Look up any stock"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); go(shown[active].ticker, shown[active].instrument_type); }
        }}
      />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Matching stocks" className="hero-search-list">
          {shown.map((r, i) => (
            <li
              key={r.ticker}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              className="hero-search-option"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r.ticker, r.instrument_type)}
            >
              <CompanyLogo ticker={r.ticker} name={r.name} logoUrl={r.logo_url ?? undefined} size={24} />
              <span className="hero-search-ticker mono">{r.ticker}</span>
              {/* clamp-ok: a company name in a one-line result row */}
              <span className="hero-search-name truncate" title={r.name}>{displayCompanyName(r.name, r.ticker)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && noMatch && (
        <p className="hero-search-list hero-search-empty" role="status">
          No stock matches &ldquo;{query.trim()}&rdquo;. Try a company name or a ticker like AAPL.
        </p>
      )}
    </div>
  );
}

// ── Why it moved: real answers ───────────────────────────────────────────────
// The page promises explanations, so the hero shows real ones: the biggest
// moves BullPen already explained in the latest session (cached answers only,
// see /api/market/landing-why). Nothing here is written for the page.

function sessionLabel(date: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (date === today) return 'Today';
  // A date-only value: format it in UTC so no time zone can shift the day.
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function WhyDemo() {
  const { data, isLoading } = useQuery({
    queryKey: ['landing-why'],
    queryFn: async (): Promise<LandingWhyPayload | null> => {
      const res = await fetch('/api/market/landing-why');
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json as LandingWhyPayload) : null;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const [pick, setPick] = useState(0);
  const answers = data?.answers ?? [];
  const current = answers[Math.min(pick, answers.length - 1)];

  return (
    <figure className="why-demo" aria-busy={isLoading}>
      <figcaption className="why-demo-head">
        <span className="why-demo-title">Why it moved</span>
        <span className="why-demo-when">
          {data ? `${sessionLabel(data.date)}, as BullPen explained it` : 'How BullPen explains a move'}
        </span>
      </figcaption>

      {isLoading ? (
        <div className="why-demo-body" aria-label="Loading">
          <span className="hero-skel" style={{ width: '55%', height: 18 }} />
          <span className="hero-skel" style={{ width: '100%', height: 14 }} />
          <span className="hero-skel" style={{ width: '88%', height: 14 }} />
        </div>
      ) : current ? (
        <>
          {answers.length > 1 && (
            <div className="why-demo-picks" role="group" aria-label="Pick a stock">
              {answers.map((a, i) => (
                <button
                  key={a.ticker}
                  type="button"
                  aria-pressed={a === current}
                  className="why-demo-pick"
                  onClick={() => {
                    setPick(i);
                    trackEvent('landing_why_pick', { ticker: a.ticker });
                  }}
                >
                  <CompanyLogo ticker={a.ticker} name={a.name} size={20} />
                  <span>{a.ticker}</span>
                  <span className={`mono ${a.changePct >= 0 ? 'up' : 'down'}`}>
                    <span className="why-demo-dir" aria-hidden>{a.changePct >= 0 ? '▲' : '▼'}</span>
                    <span className="sr-only">{a.changePct >= 0 ? 'up' : 'down'}</span>
                    {Math.abs(a.changePct).toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="why-demo-body" aria-live="polite">
            <p className="why-demo-move">
              {current.name} {current.changePct >= 0 ? 'rose' : 'fell'}{' '}
              <span className={`mono ${current.changePct >= 0 ? 'up' : 'down'}`}>
                {current.changePct >= 0 ? '+' : '−'}{Math.abs(current.changePct).toFixed(2)}%
              </span>
            </p>
            <p className="why-demo-text">{current.text}</p>
            <Link href={`/stock/${symbolToSlug(current.ticker)}`} className="why-demo-link">
              Open {current.name}&apos;s page
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </>
      ) : (
        <div className="why-demo-body">
          <p className="why-demo-text">
            When a stock you follow moves {WHY_TODAY_MIN_MOVE}% or more, BullPen reads the day&apos;s news and filings and tells you why in a sentence or two, with sources.
          </p>
        </div>
      )}

      <p className="why-demo-foot">
        Free accounts get this for their biggest mover each day. Pro explains any stock.
      </p>
    </figure>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function Hero({ onSignUp }: Props) {
  return (
    <section id="top" className="hero">
      <div className="wrap">
        <div className="hero-copy">
          <h1 className="headline hero-title">
            Finally understand
            <br />
            <RotatingTopic />
          </h1>
          <p className="hero-sub">
            Every stock in plain English, and the reason behind the big moves. Made for people who aren&apos;t finance people.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={onSignUp} className="btn btn-primary hero-cta">
              Start for free
              <Icon name="arrowRight" size={16} />
            </button>
            <HeroSearch />
          </div>
          <p className="hero-trust">Free plan, no card needed. Stocks, ETFs, crypto and commodities.</p>
        </div>
        <WhyDemo />
      </div>
    </section>
  );
}
