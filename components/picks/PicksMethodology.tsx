'use client';

import { MIN_PICKS_FOR_HEADLINE } from '@/lib/picks/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * How the record is measured, and the disclaimer.
 *
 * Written in full sentences rather than legal boilerplate: a track record that
 * hides its own methodology is a marketing asset, not a record. Anyone should
 * be able to read this and reproduce the number from public prices.
 *
 * Collapsed by default behind an accordion — five paragraphs of always-visible
 * methodology text reads as a wall of clutter on a page that's mostly a chart
 * and a list of picks. Closed, this is one line; anyone who wants the detail
 * opens the row that answers their actual question instead of scanning all five.
 */
export function PicksMethodology() {
  return (
    <section aria-labelledby="methodology-heading" className="space-y-3">
      <h2
        id="methodology-heading"
        className="text-sm font-semibold uppercase tracking-widest text-muted-foreground"
      >
        How this is measured
      </h2>

      <Accordion type="single" collapsible className="rounded-xl border border-border/50 bg-card/40 px-4">
        <AccordionItem value="how-chosen">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            Numbers pick the shortlist, AI checks it
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            Since October 2026, the AI no longer proposes the ideas. Each week a fixed
            screen ranks every US stock worth at least $2 billion against its own sector
            on value, business quality and price trend, the factors with the longest
            record of working outside the studies that found them. The top 25 go to an
            AI analyst, which reads each company&apos;s recent news and drops any whose
            story the numbers don&apos;t show, such as a guidance cut or an accounting
            problem. Three separate AI runs then argue the case for and against every
            finalist and each pick one. The pick is the name at least two of them chose,
            and the pick page shows how many agreed.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="quarters">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            Quarters group picks, they never reset them
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            A quarter shows the picks made during it. Their returns keep counting after
            the quarter ends, measured against the S&amp;P from each pick&apos;s own entry
            date, because a call made for the next year can&apos;t be judged in its first
            week. Thirteen picks is also too few to separate skill from luck, so read
            one quarter as a snapshot and the full record as the real test.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="entry-price">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            The entry price is the first price you could have paid
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            Each pick publishes before the market opens. Its entry is the{' '}
            <em>opening price of the next regular session</em> — not the previous close,
            and not a price we chose afterwards. It&apos;s stamped once and the database
            rejects any attempt to change it later.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="hundred-once">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            Every pick counts $100, once
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            The chart simulates putting $100 into each pick on its own entry date. New
            money enters the cost basis at the same moment it enters the value, so
            adding a pick never lifts the line on its own — the line only moves when
            the picks do.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="benchmark">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            The benchmark buys on the same days
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            The S&amp;P comparison isn&apos;t the index over the same window. It&apos;s
            $100 into SPY on each pick&apos;s own entry date, so it answers the harder
            question: would you have done better just buying the index on the days we
            made a call?
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="nothing-removed">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            Nothing is ever removed
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            Picks are never closed early, deleted, or quietly dropped. A pick only stops
            moving if the company is acquired or delisted, and it stays in the record at
            that final price. Every loser above is a loser we published.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="disclaimer" className="last:border-b-0">
          <AccordionTrigger className="text-sm font-semibold text-foreground">
            This is research, not advice
          </AccordionTrigger>
          <AccordionContent className="text-[12px] leading-relaxed text-muted-foreground">
            Bull&apos;s Weekly Pick is generated by an AI model from market data and public
            news. It is not a recommendation to buy or sell anything, it is not personal
            financial advice, and it takes no account of your situation, goals, or risk
            tolerance. Past performance says nothing reliable about future returns — and
            below {MIN_PICKS_FOR_HEADLINE} picks it says almost nothing at all. Returns
            shown are price-only: they exclude dividends, fees, taxes, and any difference
            between the opening price and the price you would actually have been filled at.
            Do your own research before acting on anything here.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
