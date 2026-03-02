/**
 * Resend email client for BullPen.
 *
 * Set RESEND_API_KEY in .env.local.
 * Uses updates.bullpen.no for sending (verify domain in Resend dashboard).
 * Override with RESEND_FROM_EMAIL if needed.
 */

import { Resend } from 'resend';

const defaultFrom = process.env.RESEND_FROM_EMAIL ?? 'BullPen <hello@updates.bullpen.no>';

function getClient(): Resend {
  // Read at call time so env is loaded (e.g. by scripts that load .env.local before import)
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey?.trim() || apiKey === 're_xxxxxxxxx') {
    throw new Error(
      'RESEND_API_KEY is not set or still uses the placeholder. Add your real API key to .env.local and ensure dotenv loads it before calling sendEmail.'
    );
  }
  return new Resend(apiKey.trim());
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string; // Default: hello@updates.bullpen.no
}

/**
 * Send an email via Resend.
 * Use from API routes, server actions, or other server-side code.
 */
export async function sendEmail({
  to,
  subject,
  html,
  from = defaultFrom,
}: SendEmailOptions) {
  const resend = getClient();

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
