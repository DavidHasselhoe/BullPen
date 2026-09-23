/**
 * Manual congressional-trade ingestion.
 *
 *   npm run ingest-congress                    # every active curated member
 *   npm run ingest-congress -- nancy-pelosi    # named members only
 *   npm run ingest-congress -- --holdings      # also snapshot estimated positions
 *   npm run ingest-congress -- --holdings-only # positions only, no re-paying for trades
 *   npm run ingest-congress -- --refresh       # incremental: 20 rows/member, not 100
 *   npm run ingest-congress -- --dry-run       # price the run, fetch nothing
 *
 * Prints real credit spend per member from the vendor's own response header,
 * so the cost model in lib/congress/ingest-trades.ts stays honest.
 *
 * Always --dry-run first on a positions sweep. Trades are capped at a known
 * 100 rows per member, but the positions endpoint takes no limit and bills per
 * row, so one member with a very wide book can cost more than the entire rest
 * of the roster put together.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createServerClient } from '../lib/supabase/client';
import {
  ingestAllPoliticians,
  priceRun,
  type RunEstimate,
} from '../lib/congress/ingest-trades';

async function main() {
  const args = process.argv.slice(2);
  const holdingsOnly = args.includes('--holdings-only');
  const refresh = args.includes('--refresh');
  const dryRun = args.includes('--dry-run');
  const withHoldings = args.includes('--holdings') || holdingsOnly;
  const slugs = args.filter((a) => !a.startsWith('-'));
  const supabase = createServerClient();

  console.log(slugs.length ? `Ingesting: ${slugs.join(', ')}` : 'Ingesting all active members');

  if (dryRun) {
    const est: RunEstimate = await priceRun(supabase, {
      slugs: slugs.length ? slugs : undefined,
      holdings: withHoldings,
      holdingsOnly,
      refresh,
    });
    console.log('\nslug                     trades  positions  credits  note');
    for (const r of est.rows) {
      console.log(
        r.slug.padEnd(23),
        String(r.tradeCredits || '-').padStart(7),
        String(r.positionCount ?? '-').padStart(10),
        String(r.credits).padStart(8),
        r.note ? '  ' + r.note : '',
      );
    }
    console.log(
      `\nEstimated: ${est.totalCredits} credits (~$${(est.totalCredits / 1000).toFixed(2)})` +
        `${est.lookupCredits ? `, including ${est.lookupCredits} spent on the position-count lookup` : ''}`,
    );
    console.log('Nothing was fetched. Re-run without --dry-run to execute.');
    return;
  }

  const { results, totalCredits } = await ingestAllPoliticians(supabase, {
    slugs: slugs.length ? slugs : undefined,
    holdings: withHoldings,
    holdingsOnly,
    refresh,
  });

  console.log('\nslug                    fetched  new  skipped  posns  credits  error');
  for (const r of results) {
    console.log(
      r.slug.padEnd(23),
      String(r.fetched).padStart(7),
      String(r.inserted).padStart(4),
      String(r.skipped).padStart(8),
      String(r.positions ?? '-').padStart(6),
      String(r.creditsCharged).padStart(8),
      r.error ? '  ' + r.error : '',
    );
  }

  const failed = results.filter((r) => r.error).length;
  console.log(
    `\nTotal: ${results.reduce((s, r) => s + r.inserted, 0)} new trades, ` +
      `${totalCredits} credits (~$${(totalCredits / 1000).toFixed(2)}), ${failed} failed`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
