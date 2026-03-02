/**
 * Send a test earnings alert email to a specific address.
 * Usage: npm run test-earnings-email
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { sendEmail } from '../lib/email/resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 20px; margin: 0 0 8px;">New earnings report</h1>
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      <strong>Oracle Corporation</strong> (ORCL) filed a new 10-Q.
    </p>
    <p style="margin: 12px 0; font-size: 14px; color: #64748b;">
      Revenue: $14.33B · EPS: $1.63
    </p>
    <p style="margin: 20px 0 0;">
      <a href="${APP_URL}/stock/ORCL" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">
        View in BullPen
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      You received this because you hold ORCL and have earnings alerts enabled. Open Settings in the app to change preferences.
    </p>
  </div>
</body>
</html>
`.trim();

async function main() {
  try {
    const result = await sendEmail({
      to: 'davidhasseloe@gmail.com',
      subject: 'ORCL — New 10-Q filed',
      html,
    });
    console.log('Email sent to davidhasseloe@gmail.com:', result?.id ?? 'OK');
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
