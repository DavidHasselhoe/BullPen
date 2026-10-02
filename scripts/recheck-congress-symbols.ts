/**
 * Re-check stored vendor tickers against the filed names (migration 161).
 * Stored trades are never rewritten by ingestion, so rows from before the
 * check existed are only fixed by this.
 *
 *   npm run recheck-congress-symbols            # print what would change
 *   npm run recheck-congress-symbols -- --apply # write it
 *
 * No vendor or TwelveData calls: Supabase only.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createServerClient } from '../lib/supabase/client';
import { normalizeSymbol, verifyVendorSymbols, dropMisTickeredPositions } from '../lib/congress/ingest-trades';

type Row = {
  id: string;
  symbol: string | null;
  asset_description: string;
  asset_type: string | null;
  symbol_source: string | null;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createServerClient();

  // PostgREST caps a select at 1000 rows.
  const stored: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('congress_trades')
      .select('id, symbol, asset_description, asset_type, symbol_source')
      .not('symbol', 'is', null)
      .is('symbol_source', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    stored.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  const placeholders = stored.filter((r) => !normalizeSymbol(r.symbol));
  const rest = stored.filter((r) => normalizeSymbol(r.symbol));
  const verified = await verifyVendorSymbols(supabase, rest);
  const changed = [
    ...placeholders.map((r) => ({ ...r, symbol: null, symbol_source: 'vendor_rejected', vendor_symbol: r.symbol as string })),
    ...verified.filter((r) => r.vendor_symbol),
  ];

  const groups = new Map<string, number>();
  for (const r of changed) {
    const k = `${r.vendor_symbol} -> ${r.symbol ?? '(none)'}  ${r.asset_description.slice(0, 60)}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...groups].sort()) console.log(String(n).padStart(3), k);
  console.log(
    `\n${stored.length} vendor-ticker rows checked: ${changed.filter((r) => r.symbol).length} corrected, ` +
      `${changed.filter((r) => !r.symbol).length} dropped, ${stored.length - changed.length} kept`,
  );

  // Estimated positions: a mis-tickered one is also mis-priced, so it is
  // removed rather than re-labelled (see dropMisTickeredPositions).
  const positions: { id: string; symbol: string; company_name: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('congress_holdings')
      .select('id, symbol, company_name')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    positions.push(...((data ?? []) as typeof positions));
    if (!data || data.length < 1000) break;
  }
  const keep = new Set((await dropMisTickeredPositions(supabase, positions)).map((p) => p.id));
  const badPositions = positions.filter((p) => !keep.has(p.id));
  for (const p of badPositions) console.log('  position', p.symbol.padEnd(6), p.company_name);
  console.log(`${positions.length} positions checked: ${badPositions.length} mis-tickered`);

  if (!apply) {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }
  for (let i = 0; i < badPositions.length; i += 200) {
    const { error } = await supabase.from('congress_holdings').delete().in('id', badPositions.slice(i, i + 200).map((p) => p.id));
    if (error) throw error;
  }
  for (const r of changed) {
    const patch = r.symbol
      ? { symbol: r.symbol, symbol_source: r.symbol_source, vendor_symbol: r.vendor_symbol, price_at_trade: null, price_at_disclosure: null, sector: null, industry: null }
      : { symbol: null, symbol_source: 'vendor_rejected', vendor_symbol: r.vendor_symbol, price_at_trade: null, price_at_disclosure: null, sector: null, industry: null };
    const { error } = await supabase.from('congress_trades').update(patch as never).eq('id', r.id);
    if (error) throw error;
  }
  console.log(`Wrote ${changed.length} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
