import Link from 'next/link';
import { SectionHeading } from './Atoms';
import { Icon } from './Icon';

/**
 * The real product, one click away, no account.
 *
 * This replaced a tabbed tour of whole-screen screenshots in browser chrome:
 * shrunken screens that phones never saw at all. Every page below works signed
 * out, so the honest tour is a link to it. Text only on purpose: it sits
 * between the bento's captures and pricing as the page's quiet beat.
 */

const PLACES = [
  {
    href: '/stock/NVDA',
    title: 'Any stock, explained',
    body: 'Try NVIDIA: its health grade, key numbers in plain English, earnings and what the big funds hold.',
  },
  {
    href: '/tools/screener',
    title: 'Find stocks that fit you',
    body: 'Filter the whole market by size, sector, dividend or health grade, with every column explained.',
  },
  {
    href: '/discover/institutions',
    title: 'What famous funds own',
    body: "Berkshire, Bridgewater, Harvard's endowment and more, from their SEC filings. Full holdings with Pro.",
  },
  {
    href: '/discover/politicians',
    title: 'What Congress is trading',
    body: 'Stock trades disclosed by members of Congress and senior officials, and whether they touch your stocks.',
  },
  {
    href: '/picks',
    title: "Bull's Weekly Pick",
    body: 'One AI stock pick every Monday, tracked against the S&P 500, the losers included. The full thesis is Pro.',
  },
  {
    href: '/tools/calendar',
    title: 'The week ahead',
    body: 'Earnings, dividends and economic releases on one calendar, with results once they are out.',
  },
];

export function Explore() {
  return (
    <section id="explore" className="landing-section">
      <div className="wrap">
        <SectionHeading
          title="Look around first. No account needed."
          sub="Everything here is the real app, open to anyone. Sign up when you want it to know your stocks."
        />
        <ul className="explore-grid">
          {PLACES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="explore-card">
                <span className="explore-title">
                  {p.title}
                  <Icon name="arrowRight" size={16} className="explore-arrow" />
                </span>
                <span className="explore-body">{p.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
