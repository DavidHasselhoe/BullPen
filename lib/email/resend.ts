/**
 * Resend email client for BullPen.
 *
 * Set RESEND_API_KEY in .env.local.
 * Uses updates.bullpen.no for sending (verify domain in Resend dashboard).
 * Override with RESEND_FROM_EMAIL if needed.
 */

import { Resend } from 'resend';
import { withEmailFooter, type EmailKind, type FooterOptions } from './footer';

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
  /**
   * Which CAN-SPAM category this message falls in. Required, and deliberately
   * not defaulted: the footer rules differ (marketing must carry an opt-out and
   * a postal address), and a default would quietly pick one for a caller who
   * had not thought about it. See lib/email/footer.ts.
   */
  kind: EmailKind;
  /** Per-recipient opt-out link, when it is not the generic settings page. */
  footer?: FooterOptions;
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
  kind,
  footer,
}: SendEmailOptions) {
  const resend = getClient();

  // Added here rather than in the templates so no email can go out without
  // sender identification, and no marketing email without an opt-out.
  const body = withEmailFooter(html, kind, footer);

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: body,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
