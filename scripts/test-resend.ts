/**
 * Test Resend email integration.
 *
 * Usage: npm run test-resend
 *
 * Ensure RESEND_API_KEY is set in .env.local
 */

import { config } from 'dotenv';

// Must load .env.local before importing resend (which reads process.env)
config({ path: '.env.local' });

import { sendEmail } from '../lib/email/resend';

async function main() {
  try {
    const result = await sendEmail({
      to: 'david@hasselo.no',
      subject: 'Hello from BullPen',
      html: '<p>Congrats on sending your <strong>first email</strong> with Resend!</p>',
    });
    console.log('Email sent:', result?.id ?? 'OK');
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
