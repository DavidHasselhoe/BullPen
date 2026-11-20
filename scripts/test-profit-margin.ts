// npx tsx scripts/test-profit-margin.ts — plausibleProfitMargin against the TD responses that broke it.
import assert from 'node:assert/strict';
import { plausibleProfitMargin as p } from '../lib/twelvedata/twelvedata-client';

// SMR /statistics 2026-11-20: profit_margin +36.3% on a $186M loss.
const smr = p({ profit_margin: 0.3631, income_statement: { revenue_ttm: 2729000, net_income_to_common_ttm: -186036000, diluted_eps_ttm: -1.17 } });
assert.ok(smr != null && smr < -68 && smr > -68.3, `SMR derived ${smr}`);
assert.equal(p({ profit_margin: 0.3631, income_statement: { diluted_eps_ttm: -1.17 } }), null, 'no TTM pair: sign clash with EPS hides it');
assert.equal(p({ profit_margin: -0.125, income_statement: { diluted_eps_ttm: -3.13 } }), -0.125, 'GILD: agreeing fallback kept');
assert.equal(p({ profit_margin: 0.1 }), 0.1, 'nothing to compare: kept');
assert.equal(p({ profit_margin: 0.2, income_statement: { revenue_ttm: 0, net_income_to_common_ttm: 5 } }), 0.2, 'zero revenue: no division');
assert.equal(p(undefined), null);
console.log('ok');
