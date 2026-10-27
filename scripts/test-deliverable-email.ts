/**
 * The morning email skips addresses Resend refuses. Run: npm run test-deliverable-email
 */
import assert from 'node:assert/strict';
import { isDeliverableEmail } from '../lib/email/alert-email';

for (const ok of ['a@gmail.com', 'first.last+tag@mail.bullpeninvest.com', 'x@test.no', 'x@notexample.com']) {
  assert.equal(isDeliverableEmail(ok), true, ok);
}
for (const bad of ['qa@example.com', 'x@sub.example.org', 'x@admin', 'x@foo.test', 'x@host.invalid', 'x@localhost', 'no-at-sign', 'a@b@c.com', 'x@domain.']) {
  assert.equal(isDeliverableEmail(bad), false, bad);
}

console.log('test-deliverable-email: ok');
