/**
 * The footer every outbound email gets, and the CAN-SPAM rules that decide
 * what has to be in it.
 *
 * CAN-SPAM splits mail in two. A *commercial* message (its primary purpose is
 * advertising or promoting something) must carry a working opt-out and the
 * sender's valid physical postal address. A *transactional or relationship*
 * message (billing, account notices, something the recipient asked for) is
 * exempt from the opt-out requirement, but must still not mislead about who
 * sent it, so it gets the same identification block minus the unsubscribe.
 *
 * Applied in sendEmail() rather than in each template, so a new email can't
 * ship without it. Every caller has to say which kind it is: there's no
 * default, because guessing wrong in the quiet direction is the expensive one.
 */

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
}

/**
 * BullPen's registered postal address, e.g. "BullPen AS, Examplegata 1, 0150
 * Oslo, Norway". Required for marketing mail; there is no lawful placeholder
 * for it, so a marketing send without it fails rather than going out wrong.
 *
 * Read at call time, not module load, for the same reason getClient() in
 * resend.ts does: a script that loads .env.local before calling must still see
 * it.
 */
function postalAddress(): string | undefined {
  const value = process.env.BULLPEN_POSTAL_ADDRESS?.trim();
  return value ? value : undefined;
}

export type EmailKind =
  /** Billing, account and alert mail the user asked for. Opt-out not required. */
  | 'transactional'
  /** Primary purpose is promoting the product. Opt-out and address required. */
  | 'marketing';

export class MissingPostalAddressError extends Error {
  constructor() {
    super(
      'BULLPEN_POSTAL_ADDRESS is not set. CAN-SPAM requires a valid physical postal address in ' +
        'every marketing email, so this send was refused rather than sent without one.'
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface FooterOptions {
  /**
   * One-click opt-out for this recipient. Marketing mail must have one; for
   * transactional mail it is optional and points at notification settings.
   */
  unsubscribeUrl?: string;
}

export function emailFooterHtml(kind: EmailKind, options: FooterOptions = {}): string {
  const lines: string[] = [];

  const address = postalAddress();

  if (kind === 'marketing') {
    if (!address) throw new MissingPostalAddressError();
    const url = options.unsubscribeUrl ?? `${appUrl()}/notifications`;
    lines.push(
      `<a href="${escapeHtml(url)}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe from these emails</a>`
    );
    lines.push(escapeHtml(address));
  } else {
    lines.push(
      `You are receiving this because you have a BullPen account. ` +
        `<a href="${escapeHtml(options.unsubscribeUrl ?? `${appUrl()}/notifications`)}" style="color: #94a3b8; text-decoration: underline;">Manage email preferences</a>`
    );
    // Not legally required on transactional mail, but there is no reason to
    // withhold it when it is configured, and it helps deliverability.
    if (address) lines.push(escapeHtml(address));
  }

  return `
<div style="max-width: 480px; margin: 24px auto 0; padding-top: 16px; border-top: 1px solid #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.6; color: #64748b;">
  ${lines.map((l) => `<p style="margin: 0 0 6px;">${l}</p>`).join('\n  ')}
</div>`.trim();
}

/** Appends the footer inside <body> when there is one, otherwise at the end. */
export function withEmailFooter(html: string, kind: EmailKind, options?: FooterOptions): string {
  const footer = emailFooterHtml(kind, options);
  const closingBody = html.lastIndexOf('</body>');
  if (closingBody === -1) return `${html}\n${footer}`;
  return `${html.slice(0, closingBody)}${footer}\n${html.slice(closingBody)}`;
}
