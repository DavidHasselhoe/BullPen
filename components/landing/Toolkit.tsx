'use client';

import { Reveal, SectionHeading } from './Atoms';
import { Icon, type IconName } from './Icon';

/**
 * The full, accurate inventory of what BullPen ships.
 *
 * This section replaced a block of four fabricated testimonials (invented
 * names, handles, job titles and five-star ratings). Rather than swap in
 * different invented quotes, the slot now does something the page genuinely
 * needed: list what you actually get. Roughly a dozen shipped features —
 * Deep Dive, Portfolio Builder, Compare, the Calendar, Heatmap, Market Mood,
 * Academy, Weekly Pick — had no mention anywhere on the landing page.
 *
 * Every entry here corresponds to a real route in `lib/tools/tools-config.ts`
 * or a real entitlement in `lib/billing/entitlements.ts`. Tier labels are
 * rendered from the imported entitlement values in `Pricing.tsx`, so nothing
 * here should ever claim a limit the product doesn't enforce. If a feature is
 * removed from the app, it must be removed here too.
 */

interface Item {
  label: string;
  /** Marked Pro only where `entitlements.ts` actually gates it. */
  pro?: boolean;
}

interface Group {
  icon: IconName;
  title: string;
  blurb: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    icon: 'sparkles',
    title: 'AI analyst',
    blurb: 'Claude and GPT wired directly to live market data, filings and your own portfolio.',
    items: [
      { label: 'Ask Bull' },
      { label: 'AI Deep Dive reports' },
      { label: 'AI Portfolio Builder' },
      { label: 'AI Portfolio Checkup' },
      { label: "Bull's Weekly Pick" },
      { label: 'Why Today? move explanations', pro: true },
      { label: 'Daily Brief every morning', pro: true },
    ],
  },
  {
    icon: 'chart',
    title: 'Research',
    blurb: 'The depth of a professional terminal, without the jargon wall.',
    items: [
      { label: 'Stock, ETF, crypto & commodity pages' },
      { label: 'Advanced charts & indicators' },
      { label: 'Stock screener' },
      { label: 'Compare up to 5 companies' },
      { label: 'Financials, statistics & health score' },
      { label: 'Market events calendar' },
      { label: 'S&P 500 sector heatmap' },
      { label: 'Insider transactions', pro: true },
    ],
  },
  {
    icon: 'pie',
    title: 'Portfolio & alerts',
    blurb: 'Track what you own, and hear about it before you go looking.',
    items: [
      { label: 'Holdings tracking & CSV import' },
      { label: 'Watchlists' },
      { label: 'Price & earnings alerts' },
      { label: 'Dividend calculator' },
      { label: 'If You Bought Here calculator' },
      { label: 'Automatic brokerage sync', pro: true },
      { label: 'CSV / PDF exports', pro: true },
    ],
  },
  {
    icon: 'book',
    title: 'Learn & community',
    blurb: 'Built for people who are still learning, which is most of us.',
    items: [
      { label: 'Academy: beginner courses' },
      { label: 'Daily challenge' },
      { label: 'Plain-language glossary' },
      { label: 'Community, profiles & theses' },
      { label: 'Market Mood index' },
      { label: 'Academy: intermediate & advanced', pro: true },
    ],
  },
];

function ProTag() {
  return (
    <span
      style={{
        marginLeft: 6,
        padding: '1px 6px',
        borderRadius: 99,
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      Pro
    </span>
  );
}

export function Toolkit() {
  return (
    <section id="toolkit" style={{ padding: '120px 0 80px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          title={
            <>
              One subscription,{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                the whole desk.
              </span>
            </>
          }
          sub="No add-ons, no per-report credits, no upsell for the feature you actually came for. Here is the entire product, in full."
        />

        {/* A ruled index rather than four more cards.
            By this point the page has already spent cards on Features, How it
            works and Pricing; a fourth card grid would read as more of the same
            and lean on the "identical card grid" reflex. Dropping the card
            chrome for a hairline rule above each column makes this read as what
            it is — a contents listing — and gives the section its own texture
            without inventing a new visual language. */}
        <div className="toolkit-grid">
          {GROUPS.map((g, i) => (
            <Reveal key={g.title} delay={i + 1}>
              <div
                style={{
                  borderTop: '1px solid var(--border-strong)',
                  paddingTop: 18,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                  <Icon name={g.icon} size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      color: 'var(--fg)',
                    }}
                  >
                    {g.title}
                  </h3>
                </div>

                <p
                  style={{
                    margin: '0 0 18px',
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--fg-muted)',
                    textWrap: 'pretty',
                  }}
                >
                  {g.blurb}
                </p>

                {/* Top-aligned rather than pushed to the bottom with margin-top:auto.
                    The cards stretch to equal height, so bottom-aligning the lists
                    made them start at four different heights — ragged tops read as
                    sloppy, whereas uneven space *below* the last item is invisible. */}
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 9,
                  }}
                >
                  {g.items.map((item) => (
                    <li
                      key={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 9,
                        fontSize: 13,
                        lineHeight: 1.45,
                        color: 'var(--fg)',
                      }}
                    >
                      <Icon
                        name="check"
                        size={13}
                        stroke={2.6}
                        style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 3 }}
                      />
                      <span>
                        {item.label}
                        {item.pro && <ProTag />}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
