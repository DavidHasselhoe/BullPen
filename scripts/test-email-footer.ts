/**
 * Assert-based check for the CAN-SPAM email footer. No framework.
 *   npx tsx scripts/test-email-footer.ts
 *
 * Two things worth pinning. Marketing mail must carry an opt-out and a
 * physical postal address, and that address must be the same one published as
 * the DMCA service provider: they are one company with one address, and the
 * two disagreeing is worse than either being wrong alone.
 */

import assert from 'node:assert/strict';

import { MissingPostalAddressError, emailFooterHtml, withEmailFooter } from '../lib/email/footer';
import { REGISTERED_ADDRESS_LINES, SERVICE_PROVIDER_NAME, dmcaAgent } from '../lib/legal/dmca-agent';

function setAddress(value: string | undefined) {
  if (value === undefined) delete process.env.BULLPEN_POSTAL_ADDRESS;
  else process.env.BULLPEN_POSTAL_ADDRESS = value;
}

function main() {
  // ── Default: the registered company address ──────────────────────────────
  setAddress(undefined);

  const marketing = emailFooterHtml('marketing');
  assert.match(marketing, /Unsubscribe/, 'marketing footer carries an opt-out');
  assert.ok(marketing.includes(SERVICE_PROVIDER_NAME), 'marketing footer names the sender');
  for (const line of REGISTERED_ADDRESS_LINES) {
    assert.ok(marketing.includes(line), `marketing footer carries the address line "${line}"`);
  }

  const transactional = emailFooterHtml('transactional');
  assert.match(transactional, /Manage email preferences/, 'transactional footer links to preferences');
  assert.doesNotMatch(transactional, /Unsubscribe from these emails/, 'transactional mail needs no opt-out');

  // The same address must be the one /dmca publishes. If someone edits one
  // source and not the other, this is where it shows up.
  const published = dmcaAgent().address ?? '';
  for (const line of REGISTERED_ADDRESS_LINES) {
    assert.ok(published.includes(line), `the DMCA page publishes the same address line "${line}"`);
  }

  // ── Override ─────────────────────────────────────────────────────────────
  setAddress('BullPen AS, PO Box 1, 0150 Oslo, Norway');
  assert.match(emailFooterHtml('marketing'), /PO Box 1/, 'env override replaces the default');

  const custom = emailFooterHtml('marketing', { unsubscribeUrl: 'https://bullpen.no/u/abc' });
  assert.match(custom, /https:\/\/bullpen\.no\/u\/abc/, 'per-recipient opt-out link is used when given');

  // Injection through the override must not become markup.
  setAddress('Evil <script>alert(1)</script> Ltd');
  const escaped = emailFooterHtml('marketing');
  assert.ok(!escaped.includes('<script>'), 'address is escaped, not injected');
  assert.match(escaped, /&lt;script&gt;/, 'address is escaped, not injected');

  // ── Placement ────────────────────────────────────────────────────────────
  setAddress(undefined);
  const withBody = withEmailFooter('<html><body><p>Hi</p></body></html>', 'transactional');
  assert.ok(withBody.indexOf('Manage email preferences') < withBody.indexOf('</body>'), 'footer goes inside body');
  const noBody = withEmailFooter('<p>Hi</p>', 'transactional');
  assert.match(noBody, /Hi[\s\S]*Manage email preferences/, 'fragment gets the footer appended');

  // The fail-closed guard still exists for the day the address is emptied.
  assert.ok(
    MissingPostalAddressError.prototype instanceof Error,
    'a marketing send with no address anywhere still has something to throw'
  );

  console.log('ok - marketing mail carries an opt-out and the registered address, same one /dmca publishes');
}

main();
