/**
 * Assert-based check for the weekly earnings posts' minimum-company guard and
 * the Discord notice it sends. No framework.
 *   npm run test-earnings-minimum
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import assert from 'node:assert/strict';
import { MIN_EARNINGS_COMPANIES, tooFewCompanies, tooFewCompaniesMessage } from '../lib/instagram/content/earnings-minimum';

(async () => {
  assert.equal(MIN_EARNINGS_COMPANIES, 3);

  // The week that went out with one company: now skipped, with its name.
  const lennar = await tooFewCompanies([{ symbol: 'LEN' }]);
  assert.ok(lennar, 'one company is below the minimum');
  assert.equal(lennar.names.length, 1);
  assert.notEqual(lennar.names[0], 'LEN', 'the notice names the company, not just its ticker');

  assert.ok(await tooFewCompanies([{ symbol: 'LEN' }, { symbol: 'FDX' }]), 'two is still too few');
  assert.equal(await tooFewCompanies([{ symbol: 'LEN' }, { symbol: 'FDX' }, { symbol: 'MU' }]), null, 'three posts');
  assert.deepEqual((await tooFewCompanies([]))?.names, [], 'none at all is skipped too');

  // Wording.
  assert.equal(
    tooFewCompaniesMessage('upcoming earnings', 'Sep 14-18, 2026', ['Lennar Corp.']),
    'Instagram post for upcoming earnings (week of Sep 14-18, 2026) was not published: only 1 company (Lennar Corp.) is reporting earnings. Posts need at least 3.'
  );
  assert.equal(
    tooFewCompaniesMessage('upcoming earnings', 'Sep 21-25, 2026', ['FedEx', 'Micron']),
    'Instagram post for upcoming earnings (week of Sep 21-25, 2026) was not published: only 2 companies (FedEx, Micron) are reporting earnings. Posts need at least 3.'
  );
  assert.equal(
    tooFewCompaniesMessage('earnings results', 'Sep 14-18, 2026', ['Lennar Corp.']),
    'Instagram post for earnings results (week of Sep 14-18, 2026) was not published: only 1 company (Lennar Corp.) reported earnings with an estimate to compare against. Posts need at least 3.'
  );
  assert.ok(tooFewCompaniesMessage('upcoming earnings', 'Oct 5-9, 2026', []).includes('no S&P 500, Nasdaq 100 or curated company is reporting earnings'));

  console.log(`earnings minimum: all assertions passed (LEN resolves to "${lennar.names[0]}")`);
})();
