/**
 * "Get Micron's results the morning after": earnings-results emails for
 * visitors without an account (migration 186). Double opt-in: subscribe()
 * sends a confirm link and nothing else goes out until it is clicked.
 * sendResultsEmails() runs from the daily cron and sends each confirmed
 * subscriber one email per report, once the calendar has the actual EPS.
 *
 * Names come from our own index, never from the request, so a form post
 * can't put someone else's words into an email we send. English only, like
 * the morning email.
 */

import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { EMAIL_FOOTER_MARKER } from '@/lib/email/footer';
import { isDeliverableEmail } from '@/lib/email/alert-email';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getCalendarRange } from '@/lib/market-data/calendar-days';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { logger } from '@/lib/utils/logger';
import { SITE_URL } from '@/lib/site';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
const UTM = 'utm_source=email&utm_medium=results&utm_campaign=earnings_results';
const SYMBOL_RE = /^[A-Z0-9.\-]{1,12}$/;
/** One confirm email per address and company an hour, so the form can't be used to flood an inbox. */
const RESEND_AFTER_MS = 60 * 60 * 1000;
/** New subscriptions per address a day. */
const MAX_NEW_PER_DAY = 10;
/** Reports this many days back still go out, for a cron that missed a day or an actual that came in late. */
const LOOKBACK_DAYS = 3;

// The morning email's dark tokens (lib/email/alert-email.ts), so the two read as one product.
const C = {
  bg: '#0b0f0d', surface: '#161b19', border: '#262b29', ink: '#fafafa', muted: '#a3a3a3',
  up: '#34d399', down: '#f87171', accent: '#3cc47c', accentInk: '#06210f',
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

interface SubRow {
  id: string;
  email: string;
  symbol: string;
  token: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  last_sent_date: string | null;
  created_at: string;
}

// email_subscriptions isn't in the generated Database type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (createServerClient() as any).from('email_subscriptions');

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const withUtm = (href: string) => `${APP_URL}${href}${href.includes('?') ? '&' : '?'}${UTM}`;
const subscriptionUrl = (action: 'confirm' | 'unsubscribe', token: string) => `${APP_URL}/api/subscribe/${action}?token=${token}`;

export type SubscribeResult = 'sent' | 'already' | 'invalid' | 'limited';

export async function subscribe(rawEmail: string, rawSymbol: string): Promise<SubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  const symbol = rawSymbol.trim().toUpperCase();
  if (email.length > 254 || !isDeliverableEmail(email) || !SYMBOL_RE.test(symbol)) return 'invalid';
  const name = (await getDisplayNames([symbol])).get(symbol);
  if (!name) return 'invalid';

  const { data: existing } = await table().select('*').eq('email', email).eq('symbol', symbol).maybeSingle();
  const row = existing as SubRow | null;
  if (row?.confirmed_at && !row.unsubscribed_at) return 'already';

  let token: string;
  if (row) {
    if (Date.now() - Date.parse(row.created_at) < RESEND_AFTER_MS) return 'limited';
    // A fresh opt-in for a lapsed or unconfirmed row: it starts over as pending.
    const { error } = await table()
      .update({ created_at: new Date().toISOString(), confirmed_at: null, unsubscribed_at: null })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    token = row.token;
  } else {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await table().select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', since);
    if ((count ?? 0) >= MAX_NEW_PER_DAY) return 'limited';
    const { data, error } = await table().insert({ email, symbol }).select('token').single();
    if (error) throw new Error(error.message);
    token = (data as { token: string }).token;
  }

  await sendEmail({
    to: email,
    subject: `Confirm: ${name}'s results by email`,
    html: confirmEmailHtml(name, subscriptionUrl('confirm', token)),
    kind: 'transactional',
    footer: {
      reason: `Someone, hopefully you, asked for ${name}'s earnings results on bullpeninvest.com. Ignore this email and nothing more will come.`,
      unsubscribeUrl: subscriptionUrl('unsubscribe', token),
      unsubscribeLabel: 'Not you? Cancel this request',
    },
  });
  return 'sent';
}

/** The symbol confirmed, or null for an unknown token. */
export async function confirmSubscription(token: string): Promise<string | null> {
  const { data } = await table()
    .update({ confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq('token', token)
    .select('symbol')
    .maybeSingle();
  return (data as { symbol: string } | null)?.symbol ?? null;
}

export async function unsubscribe(token: string): Promise<string | null> {
  const { data } = await table()
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('token', token)
    .select('symbol')
    .maybeSingle();
  return (data as { symbol: string } | null)?.symbol ?? null;
}

// ─── The results email ───────────────────────────────────────────────────────

export interface ResultCopy {
  subject: string;
  headline: string;
  verdict: 'beat' | 'missed' | 'matched' | null;
  surprisePct: number | null;
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

/** Plain-words verdict on reported vs expected earnings per share. */
export function resultCopy(name: string, actual: number, estimate: number | null): ResultCopy {
  if (estimate == null) {
    return { subject: `${name} earned ${money(actual)} a share`, headline: `${name} reported`, verdict: null, surprisePct: null };
  }
  const diff = Math.round((actual - estimate) * 100) / 100;
  const verdict = diff > 0 ? 'beat' : diff < 0 ? 'missed' : 'matched';
  const surprisePct = estimate !== 0 ? ((actual - estimate) / Math.abs(estimate)) * 100 : null;
  const subject =
    verdict === 'matched'
      ? `${name} matched estimates at ${money(actual)} a share`
      : `${name} ${verdict} estimates: ${money(actual)} a share vs ${money(estimate)} expected`;
  return { subject, headline: `${name} ${verdict === 'matched' ? 'matched expectations' : `${verdict} expectations`}`, verdict, surprisePct };
}

function shell(title: string, body: string, preview: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:${C.bg};">${escapeHtml(preview)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
    <tr><td align="center" style="padding:28px 16px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:${FONT};">
        <tr><td style="padding:0 0 20px;font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">bullpen</td></tr>${body}
        <tr><td style="padding:12px 0 0;">${EMAIL_FOOTER_MARKER}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const button = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${C.accent};color:${C.accentInk};text-decoration:none;font-size:16px;line-height:1;font-weight:600;padding:15px 24px;border-radius:999px;">${escapeHtml(label)}</a>`;

function confirmEmailHtml(name: string, confirmUrl: string): string {
  return shell(`Confirm ${name}'s results`, `
        <tr><td><h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">One click and you're set</h1></td></tr>
        <tr><td style="padding:8px 0 0;font-size:15px;line-height:1.55;color:${C.muted};">Confirm and we'll email you ${escapeHtml(name)}'s results the morning after each report: what they earned, what analysts expected and whether it was a beat or a miss.</td></tr>
        <tr><td style="padding:20px 0 0;">${button(confirmUrl, 'Confirm my email')}</td></tr>`,
    `Confirm to get ${name}'s earnings results`);
}

/** Exported for the script that previews it. */
export function resultEmailHtml(opts: {
  name: string; symbol: string; date: string; actual: number; estimate: number | null;
}): { subject: string; html: string } {
  const { name, symbol, actual, estimate } = opts;
  const copy = resultCopy(name, actual, estimate);
  const color = copy.verdict === 'beat' ? C.up : copy.verdict === 'missed' ? C.down : C.ink;
  const arrow = copy.verdict === 'beat' ? '&#9650;&nbsp;' : copy.verdict === 'missed' ? '&#9660;&nbsp;' : '';
  const when = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${opts.date}T12:00:00Z`));
  const stat = (label: string, value: string, valueColor = C.ink) => `
                <td width="33%" valign="top" style="padding:14px 12px 14px 0;">
                  <span style="display:block;font-size:12px;line-height:1.4;color:${C.muted};">${label}</span>
                  <span style="display:block;margin-top:4px;font-size:20px;line-height:1.2;font-weight:700;color:${valueColor};">${value}</span>
                </td>`;
  const cells = [
    stat('Earned per share', money(actual)),
    estimate != null ? stat('Analysts expected', money(estimate)) : '',
    copy.surprisePct != null && copy.verdict !== 'matched'
      ? stat(copy.verdict === 'beat' ? 'Beat by' : 'Missed by', `${arrow}${Math.abs(copy.surprisePct).toFixed(1)}%`, color)
      : '',
  ].join('');
  const explainer =
    copy.verdict === 'beat' ? `${name} made more profit per share than Wall Street expected.`
    : copy.verdict === 'missed' ? `${name} made less profit per share than Wall Street expected.`
    : copy.verdict === 'matched' ? `${name} made exactly the profit per share Wall Street expected.`
    : `There was no analyst estimate to compare it with this time.`;
  const page = slugToAssetPath(symbol);

  const html = shell(copy.subject, `
        <tr><td style="font-size:13px;line-height:1.4;color:${C.muted};padding:0 0 6px;">Reported ${escapeHtml(when)}</td></tr>
        <tr><td><h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">${escapeHtml(copy.headline)}</h1></td></tr>
        <tr><td style="padding:8px 0 0;font-size:15px;line-height:1.55;color:${C.muted};">${escapeHtml(explainer)}</td></tr>
        <tr><td style="padding:16px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:14px;font-variant-numeric:tabular-nums;">
            <tr><td style="padding:0 0 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 0 0;">${button(withUtm(page), `See ${name}'s full results`)}</td></tr>
        <tr><td style="padding:16px 0 0;font-size:14px;line-height:1.55;color:${C.muted};">Want this for every company you follow, plus why stocks moved? <a href="${escapeHtml(withUtm('/register'))}" style="color:${C.ink};font-weight:600;">Make a free account</a>.</td></tr>`,
    `${name}: ${money(actual)} a share${estimate != null ? ` vs ${money(estimate)} expected` : ''}`);
  return { subject: copy.subject, html };
}

export interface ResultsRun { reports: number; sent: number; failed: number; dryRun: boolean }

export async function sendResultsEmails(opts: { dryRun?: boolean; today?: string } = {}): Promise<ResultsRun> {
  const today = opts.today ?? todayET();
  const run: ResultsRun = { reports: 0, sent: 0, failed: 0, dryRun: !!opts.dryRun };

  const { data } = await table().select('*').not('confirmed_at', 'is', null).is('unsubscribed_at', null);
  const subs = (data ?? []) as SubRow[];
  if (!subs.length) return run;

  // Cache only: the calendar crons keep these days warm, and a send must not spend TwelveData credits.
  const { byDate } = await getCalendarRange<EarningsCalendarItem>('earnings', addDays(today, -LOOKBACK_DAYS), today, { allowFetch: false });
  const wanted = new Set(subs.map((s) => s.symbol));
  const latest = new Map<string, EarningsCalendarItem>();
  for (const rows of byDate.values()) {
    for (const r of rows ?? []) {
      if (!wanted.has(r.symbol) || r.eps_actual == null) continue;
      const prev = latest.get(r.symbol);
      if (!prev || r.date > prev.date) latest.set(r.symbol, r);
    }
  }
  run.reports = latest.size;
  if (!latest.size) return run;
  const names = await getDisplayNames([...latest.keys()]);

  for (const sub of subs) {
    const r = latest.get(sub.symbol);
    // Once per report, and never a report from before they signed up.
    if (!r || (sub.last_sent_date && r.date <= sub.last_sent_date) || r.date < sub.created_at.slice(0, 10)) continue;
    const unsubscribeUrl = subscriptionUrl('unsubscribe', sub.token);
    const { subject, html } = resultEmailHtml({
      name: names.get(sub.symbol) ?? sub.symbol, symbol: sub.symbol, date: r.date,
      actual: r.eps_actual as number, estimate: r.eps_estimate ?? null,
    });
    if (opts.dryRun) { run.sent++; continue; }
    try {
      await sendEmail({
        to: sub.email, subject, html, kind: 'marketing',
        footer: { unsubscribeUrl },
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      await table().update({ last_sent_date: r.date }).eq('id', sub.id);
      run.sent++;
    } catch (err) {
      run.failed++;
      logger.error('[results-email] send failed', { symbol: sub.symbol, err: String(err) });
    }
  }
  return run;
}
