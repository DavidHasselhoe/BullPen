import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { getSharedList, type SharedList } from '@/lib/watchlist/shared-list';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtClockDate, fmtClockTime, type Clock } from '@/lib/dates/clock';
import { cn } from '@/lib/utils';

/**
 * A watchlist list someone chose to share (migration 179), read-only and
 * public. Rendered once and cached for five minutes: a link that spreads
 * costs at most one quote per stock per refresh. Stopping sharing purges it
 * (see /api/watchlist/lists/[listId]/share). Not for search engines: these
 * are personal lists, thin by design.
 *
 * English only, like the other signed-out share pages (/share, /invite):
 * there is no visitor language to read on the server.
 */
export const revalidate = 300;

/** generateMetadata and the page both need it: one read and one quote fetch per render. */
const loadList = cache(getSharedList);

interface Props {
  params: Promise<{ token: string }>;
}

/** Signed-out visitors have no clock setting; exchange time, labelled. */
const ET: Clock = { timeZone: 'America/New_York', hour12: true, locale: 'en-US' };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const list = await loadList(token);
  if (!list) return { title: 'List not found', robots: { index: false, follow: false } };
  const description = "The stocks in this watchlist and how they've done since they were added, compared with the S&P 500.";
  return {
    title: `${list.name}, a shared watchlist`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: `${list.name}, a watchlist on BullPen`, description },
  };
}

function signed(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;
}

/** Signal colors only: emerald up, red down. */
function tone(n: number | null) {
  return n == null || n === 0 ? 'text-muted-foreground' : n > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
}

function Scorecard({ list }: { list: SharedList }) {
  const s = list.score;
  if (!s) return null;
  const gap = s.pct - s.benchPct;
  return (
    <section aria-label="How this list has done" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">Since the stocks were added</p>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={cn('font-mono text-3xl font-semibold tabular-nums', tone(s.pct))}>{signed(s.pct)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">S&amp;P 500 {signed(s.benchPct)} over the same days</span>
      </div>
      <p className="text-sm text-foreground">
        {Math.abs(gap) < 0.05
          ? 'Level with the market.'
          : `${Math.abs(gap).toFixed(1)} points ${gap > 0 ? 'ahead of' : 'behind'} the market.`}
        {s.removed > 0 && ` Includes ${s.removed} ${s.removed === 1 ? 'stock' : 'stocks'} taken off the list.`}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Worked out as if the same amount had gone into each stock at the close on the day it was added, and the same
        into the S&amp;P 500 on those days. Nobody necessarily bought these. Stocks taken off the list still count, up to
        the day they left, so dropping the losers can&apos;t improve the record.
      </p>
    </section>
  );
}

export default async function SharedListPage({ params }: Props) {
  const { token } = await params;
  const list = await loadList(token);
  if (!list) notFound();

  const asOf = new Date(list.asOf);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shared watchlist</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
          {list.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: list.color }} aria-hidden />}
          {list.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {list.stocks.length} {list.stocks.length === 1 ? 'stock' : 'stocks'}
          {list.sharedAt && <> · shared {fmtClockDate(new Date(list.sharedAt), { month: 'short', day: 'numeric', year: 'numeric' }, ET)}</>}
        </p>
      </header>

      <Scorecard list={list} />

      <section aria-label="Stocks in this list" className="overflow-hidden rounded-xl border border-border">
        <div className="hidden grid-cols-[1fr_6rem_7rem_5rem] gap-3 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>Stock</span>
          <span className="text-right">Today</span>
          <span className="text-right">Since added</span>
          <span className="text-right">Added</span>
        </div>
        <ul className="divide-y divide-border">
          {list.stocks.map((s) => (
            <li key={s.symbol}>
              <Link
                href={slugToAssetPath(s.symbol)}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_6rem_7rem_5rem]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <CompanyLogo ticker={s.symbol} name={s.name} logoUrl={s.logoUrl} size={28} />
                  <span className="min-w-0">
                    {/* clamp-ok: a company name in a dense row; the ticker sits under it */}
                    <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.symbol}</span>
                  </span>
                </span>
                <span className={cn('text-right font-mono text-sm tabular-nums', tone(s.changePercent))}>
                  {s.changePercent != null ? signed(s.changePercent) : '—'}
                </span>
                <span className={cn('col-start-2 text-right font-mono text-sm tabular-nums sm:col-start-auto', tone(s.sinceAdded))}>
                  <span className="text-xs text-muted-foreground sm:hidden">Since added </span>
                  {s.sinceAdded != null ? signed(s.sinceAdded) : '—'}
                </span>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">
                  {fmtClockDate(new Date(s.addedAt), { month: 'short', day: 'numeric' }, ET)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Prices as of {fmtClockTime(asOf, ET)} ET and may be delayed. This page refreshes every few minutes.
      </p>

      <aside className="rounded-xl bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">Not investment advice.</span> This is a list of stocks someone
          is following, shared for interest. It isn&apos;t a recommendation to buy or sell anything, and past moves
          don&apos;t tell you what happens next.{' '}
          <Link href="/disclosures" className="text-foreground underline underline-offset-2 hover:text-primary">
            Read our disclosures
          </Link>
          .
        </p>
      </aside>

      <section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Keep your own watchlist</h2>
        <p className="text-sm text-muted-foreground">
          BullPen tracks how your picks do against the market, explains big moves in plain English, and tells you
          what&apos;s coming up for them. Free to start.
        </p>
        <Link
          href="/register"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Create a free account
        </Link>
      </section>
    </main>
  );
}
