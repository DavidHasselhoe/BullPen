/**
 * Assert-based check for the CAN-SPAM email footer. No framework.
 *   npx tsx scripts/test-email-footer.ts
 *
 * The rule worth pinning: a marketing send with no postal address configured
 * must fail rather than go out without one. Everything else about the footer is
 * cosmetic; that part is the law.
 */

import assert from 'node:assert/strict';

import { MissingPostalAddressError, emailFooterHtml, withEmailFooter } from '../lib/email/footer';

function setAddress(value: string | undefined) {
  if (value === undefined) delete process.env.BULLPEN_POSTAL_ADDRESS;
  else process.env.BULLPEN_POSTAL_ADDRESS = value;
}

function main() {
  // ── No address configured ────────────────────────────────────────────────
  setAddress(undefined);

  assert.throws(
    () => emailFooterHtml('marketing'),
    MissingPostalAddressError,
    'marketing mail with no postal address must be refused'
  );

  const transactional = emailFooterHtml('transactional');
  assert.match(transactional, /Manage email preferences/, 'transactional footer links to preferences');
  assert.doesNotThrow(() => emailFooterHtml('transactional'), 'transactional mail still sends without an address');

  // ── Address configured ───────────────────────────────────────────────────
  setAddress('BullPen AS, Testveien 1, 0150 Oslo, Norway');

  const marketing = emailFooterHtml('marketing');
  assert.match(marketing, /Unsubscribe/, 'marketing footer carries an opt-out');
  assert.match(marketing, /Testveien 1/, 'marketing footer carries the postal address');

  const custom = emailFooterHtml('marketing', { unsubscribeUrl: 'https://bullpen.no/u/abc' });
  assert.match(custom, /https:\/\/bullpen\.no\/u\/abc/, 'per-recipient opt-out link is used when given');

  // Injection through the address env var must not become markup.
  setAddress('Evil <script>alert(1)</script> Ltd');
  const escaped = emailFooterHtml('marketing');
  assert.ok(!escaped.includes('<script>'), 'address is escaped, not injected');
  assert.match(escaped, /&lt;script&gt;/, 'address is escaped, not injected');

  // ── Placement ────────────────────────────────────────────────────────────
  const withBody = withEmailFooter('<html><body><p>Hi</p></body></html>', 'transactional');
  assert.ok(withBody.indexOf('Manage email preferences') < withBody.indexOf('</body>'), 'footer goes inside body');
  const noBody = withEmailFooter('<p>Hi</p>', 'transactional');
  assert.match(noBody, /Hi[\s\S]*Manage email preferences/, 'fragment gets the footer appended');

  console.log('ok - marketing mail cannot send without a postal address; footers land inside <body>');
}

main();
