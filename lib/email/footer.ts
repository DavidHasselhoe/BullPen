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

import { REGISTERED_ADDRESS_LINES, SERVICE_PROVIDER_NAME } from '@/lib/legal/dmca-agent';

import { SITE_URL } from '@/lib/site';
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
}

/** Opens Settings on the Notifications tab, where the email toggles live (Navigation reads ?settings=). */
export function emailSettingsUrl(): string {
  return `${appUrl()}/notifications?settings=notifications`;
}

/**
 * The physical postal address CAN-SPAM requires in commercial mail.
 *
 * Defaults to the same address registered as the DMCA service provider, since
 * it is one company with one address and two pages of it disagreeing is a
 * worse outcome than either being wrong alone. BULLPEN_POSTAL_ADDRESS
 * overrides it if mail should carry a different one, such as a PO box.
 *
 * Read at call time, not module load, for the same reason getClient() in
 * resend.ts does: a script that loads .env.local before calling must still see
 * it.
 */
function postalAddress(): string | undefined {
  const override = process.env.BULLPEN_POSTAL_ADDRESS?.trim();
  if (override) return override;
  return [SERVICE_PROVIDER_NAME, ...REGISTERED_ADDRESS_LINES].join(', ');
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
  /** Transactional only: why this email arrived, when "you have an account" undersells it. */
  reason?: string;
  /** Transactional only: the link's words, when it doesn't lead to general preferences. */
  unsubscribeLabel?: string;
}

/**
 * Where a template wants the footer. Without it the footer goes at the end of
 * <body>, which Gmail renders outside a dark template's own background.
 */
export const EMAIL_FOOTER_MARKER = '<!--bullpen-email-footer-->';

export function emailFooterHtml(kind: EmailKind, options: FooterOptions = {}): string {
  const lines: string[] = [];

  const address = postalAddress();

  if (kind === 'marketing') {
    if (!address) throw new MissingPostalAddressError();
    const url = options.unsubscribeUrl ?? emailSettingsUrl();
    lines.push(
      `<a href="${escapeHtml(url)}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe from these emails</a>`
    );
    lines.push(escapeHtml(address));
  } else {
    lines.push(
      `${escapeHtml(options.reason ?? 'You are receiving this because you have a BullPen account.')} ` +
        `<a href="${escapeHtml(options.unsubscribeUrl ?? emailSettingsUrl())}" style="color: #cbd5e1; text-decoration: underline;">${escapeHtml(options.unsubscribeLabel ?? 'Manage email preferences')}</a>`
    );
    // Not legally required on transactional mail, but there is no reason to
    // withhold it when it is configured, and it helps deliverability.
    if (address) lines.push(escapeHtml(address));
  }

  return `
<div style="max-width: 480px; margin: 24px auto 0; padding-top: 16px; border-top: 1px solid #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.6; color: #94a3b8;">
  ${lines.map((l) => `<p style="margin: 0 0 6px;">${l}</p>`).join('\n  ')}
</div>`.trim();
}

/** Appends the footer inside <body> when there is one, otherwise at the end. */
export function withEmailFooter(html: string, kind: EmailKind, options?: FooterOptions): string {
  const footer = emailFooterHtml(kind, options);
  if (html.includes(EMAIL_FOOTER_MARKER)) return html.replace(EMAIL_FOOTER_MARKER, footer);
  const closingBody = html.lastIndexOf('</body>');
  if (closingBody === -1) return `${html}\n${footer}`;
  return `${html.slice(0, closingBody)}${footer}\n${html.slice(closingBody)}`;
}
