/**
 * Token checks for lib/auth/email-verification.ts. No network, no DB.
 * npm run test-email-verification
 */
import assert from 'node:assert/strict';

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';

async function main() {
  const { createVerifyToken, readVerifyToken } = await import('../lib/auth/email-verification');
  const now = Date.now();
  const token = createVerifyToken('user-1', 'Someone@Example.com', now);

  assert.deepEqual(readVerifyToken(token, now), { userId: 'user-1', email: 'someone@example.com' });
  assert.equal(readVerifyToken(token, now + 8 * 24 * 3600 * 1000), null, 'expired after 7 days');

  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'user-2', e: 'someone@example.com', x: now + 1e9 })).toString('base64url');
  assert.equal(readVerifyToken(`${forged}.${sig}`, now), null, 'payload swap rejected');
  assert.equal(readVerifyToken(`${payload}.${sig.slice(0, -2)}xx`, now), null, 'tampered signature rejected');
  assert.equal(readVerifyToken('garbage', now), null);
  assert.equal(readVerifyToken('', now), null);

  console.log('email verification token checks passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
