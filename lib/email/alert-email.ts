/**
 * The morning alert email: one email a day, only when something happened,
 * carrying the alerts a user has on: earnings, ex-dividend dates, big moves,
 * Health Score grade changes, politicians trading their stocks, index changes
 * and the day's economic releases. Before this those only ever landed in the
 * in-app panel, and the 2026-10-23 activation check found none of 14 new users
 * had read one.
 *
 * Built from the notifications the crons already wrote, plus Why Today answers
 * someone already paid for, so it adds no data or AI cost and inherits each
 * per-type toggle. `emailed_at`
 * (migration 181) keeps an alert from going out twice. English only for now:
 * the rows carry an English title/message beside their i18n params.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { EMAIL_FOOTER_MARKER } from '@/lib/email/footer';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { todayET } from '@/lib/dates/calendar-format';
import { BIG_FOUR_LESSON } from '@/lib/market-data/economic-kinds';
import { rget } from '@/lib/cache/redis-cache';
import { whyTodayKey, isStale, type CachedWhyToday } from '@/lib/ai/why-today';
import { logger } from '@/lib/utils/logger';
import { SITE_URL } from '@/lib/site';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
/** The crons write at 08:00 and 21:30 UTC; 26h covers both with slack for drift. */
const LOOKBACK_MS = 26 * 60 * 60 * 1000;
const UTM = 'utm_source=email&utm_medium=alert&utm_campaign=morning_alert';
/** The email shipped 2026-10-23. Accounts older than this had alerts in the app only. */
const EMAIL_LAUNCH = '2026-10-24T00:00:00Z';
/** Past this the email stops being a glance; the rest is one "more in the app" line. */
const MAX_CARDS = 6;

interface AlertRow {
  id: string;
  user_id: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  message: string;
  created_at: string;
}

type Section = 'earnings' | 'move' | 'health' | 'politicians' | 'index' | 'dividend' | 'economic';

interface EmailItem {
  section: Section;
  /** Big moves only: an arrow beside the colour, never colour alone. */
  direction?: 'up' | 'down';
  headline: string;
  detail: string;
  /** Single big moves only: the cached Why Today answer, when there is one. */
  why?: string;
  /** Where the tap leads, said out loud, when the headline doesn't say it. */
  cue?: string;
  href: string;
  /** The stock a single big move is about, to look up its Why Today answer. */
  symbol?: string;
  /** Signed close-to-close move, for the same lookup's staleness check. */
  movePct?: number;
}

// ─── Unsubscribe token ───────────────────────────────────────────────────────

// ponytail: keyed on the service role key, so rotating that key breaks the
// unsubscribe links in emails already sent (CAN-SPAM wants them working for 30
// days). If it is ever rotated, accept the old key here for 30 days too.
function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  // Its own label, so this can never verify as an email-verification token.
  return createHmac('sha256', secret).update('bullpen:alert-email-unsubscribe:v1').digest();
}

function sign(userId: string): string {
  return createHmac('sha256', signingKey()).update(userId).digest('base64url');
}

/** No expiry: an unsubscribe link has to keep working in an old email. */
export function createUnsubscribeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function readUnsubscribeToken(token: string): string | null {
  const [userId, sig] = token.split('.');
  if (!userId || !sig) return null;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}

/** The page a person lands on from the link: it asks before turning anything off. */
export function unsubscribeUrl(userId: string): string {
  return `${APP_URL}/email/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(userId))}`;
}

/** RFC 8058 one-click target: the mail client POSTs here from its own Unsubscribe button. */
function oneClickUrl(userId: string): string {
  return `${APP_URL}/api/email/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(userId))}`;
}

/** Turns the morning email off. Same key the Settings toggle writes. */
export async function disableAlertEmail(userId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase.from('users').select('settings').eq('id', userId).maybeSingle();
  if (!data) return false;
  const settings = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  const notifications = { ...((settings.notifications as Record<string, boolean>) ?? {}), email_alerts: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('users').update({ settings: { ...settings, notifications } }).eq('id', userId);
  return !error;
}

// ─── Picking and wording the alerts ──────────────────────────────────────────

const leadingTicker = (title: string) => title.match(/^([A-Z]{1,6}(?:[./][A-Z]{1,6})?)\b/)?.[1] ?? null;

/** A real minus sign: a hyphen before a number reads as "dash" aloud and looks lighter than "+". */
const minus = (s: string) => s.replace(/-(?=\$?\d)/g, '−');

/**
 * Stored move text is written at the close for the panel ("META moved -7.0%
 * today", "AMD +6.2%, MU +5.4% +3 more"). Read the next morning by a beginner
 * it wants plain verbs, no signs in the headline, and no "+3 more" that reads
 * like one more percentage. Anything that doesn't match is shown as stored.
 */
function moveCopy(n: AlertRow, single: boolean, down: boolean): { headline: string; detail: string } {
  if (single) {
    const pct = n.title.match(/^(\S+) moved [+-]?(\d+(?:\.\d+)?)%/);
    const close = n.message.match(/^(.+) closed at (\$[\d,.]+) \(([+-])(\$[\d,.]+)\)$/);
    return {
      headline: pct ? `${pct[1]} ${down ? 'fell' : 'rose'} ${pct[2]}%` : minus(n.title.replace(/ today\b/, '')),
      detail: close ? `${close[1]} closed at ${close[2]}, ${close[3] === '-' ? 'down' : 'up'} ${close[4]}.` : minus(n.message),
    };
  }
  const count = n.title.match(/^(\d+) of your stocks/)?.[1];
  return {
    headline: count ? `${count} of your stocks ${down ? 'fell' : 'rose'} 5% or more` : minus(n.title.replace(/ today\b/, '')),
    // A no-break space keeps "AVGO +5.0%" on one line when the list wraps.
    detail: minus(n.message.replace(/ \+(\d+) more$/, (_, k: string) => `, and ${k} other${k === '1' ? '' : 's'}`))
      .replace(/([A-Z]) (?=[+−]\d)/g, '$1 '),
  };
}

/**
 * Each alert kind, worded for a morning read. Left out: custom price alerts
 * (entity 'user_alert'), which are late by the next morning, trades by
 * politicians someone follows rather than holds, and the portfolio recap,
 * which is the email's opening line (recapLine), not a card.
 */
export function toEmailItem(n: AlertRow): EmailItem | null {
  const one = leadingTicker(n.title);
  if ((n.type === 'earnings' || n.type === 'dividend') && n.entity_type === 'portfolio') {
    return {
      section: n.type === 'earnings' ? 'earnings' : 'dividend',
      headline: n.title,
      detail: n.message,
      href: one ? slugToAssetPath(one) : '/tools/calendar',
    };
  }
  if (n.type === 'health_score' && one) {
    return { section: 'health', headline: n.title.replace(' health score ', ' Health Score '), detail: n.message, href: slugToAssetPath(one) };
  }
  if (n.type === 'politician_trade' && n.entity_id?.startsWith('politician-holdings:')) {
    return { section: 'politicians', headline: n.title, detail: n.message, href: '/discover/politicians' };
  }
  if (n.type === 'market' && n.entity_id?.includes(':index-') && one) {
    return { section: 'index', headline: n.title, detail: n.message, href: slugToAssetPath(one) };
  }
  if (n.type === 'market' && n.entity_id?.startsWith('index-fund:')) {
    return { section: 'index', headline: n.title, detail: n.message, href: `/discover/indexes/${n.entity_id.split(':')[1]}` };
  }
  if (n.type === 'market' && n.entity_id?.startsWith('economic:')) {
    return {
      section: 'economic',
      headline: n.title,
      // Only a list when there are several: one release already has its time in the headline.
      detail: n.message.includes(' · ') ? n.message : '',
      cue: 'How releases like this move stocks',
      href: BIG_FOUR_LESSON,
    };
  }
  if (n.type !== 'price_move') return null;
  const single = n.entity_type === 'stock' && !!n.entity_id?.endsWith(':price_move');
  const digest = n.entity_id === 'portfolio:price_digest_gain' || n.entity_id === 'portfolio:price_digest_loss';
  if (!single && !digest) return null;
  const down = n.entity_id === 'portfolio:price_digest_loss' || (single && /-\d/.test(n.title));
  const symbol = single && n.entity_id ? n.entity_id.split(':')[0] : null;
  const pct = n.title.match(/moved ([+-]?\d+(?:\.\d+)?)%/)?.[1];
  return {
    section: 'move',
    direction: down ? 'down' : 'up',
    ...moveCopy(n, single, down),
    // The stock page opens with Why Today; Home lists each mover with its own "Why?".
    cue: symbol ? `See why it ${down ? 'fell' : 'rose'}` : 'See why on Home',
    href: symbol ? slugToAssetPath(symbol) : '/dashboard',
    ...(symbol && pct ? { symbol, movePct: Number(pct) } : {}),
  };
}

/**
 * The Why Today answer Home or the stock page already wrote for this move.
 * Never generates one: a call is ~$0.10, and most mornings someone has asked.
 * At 08:30 UTC the session key is still the last close's, the move the card shows.
 */
async function cachedWhy(symbol: string, movePct: number): Promise<string | null> {
  const hit = await rget<CachedWhyToday>(whyTodayKey(symbol, 'en'));
  if (!hit?.text || isStale(hit, movePct)) return null;
  // "Oracle ($ORCL)" is a hover chip in the app; in an email the bare ticker reads better.
  return hit.text.replace(/\$([A-Z]{1,6})\b/g, '$1').replace(/\s*\n+\s*/g, ' ').trim();
}

/**
 * "Your portfolio +1.23% today" / "8 holdings · NVDA +4.1% led", written at
 * the close, as one plain opening sentence for the next morning. Null when the
 * row doesn't match, so a reworded recap drops out instead of reading oddly.
 */
export function recapLine(n: Pick<AlertRow, 'title' | 'message'>): string | null {
  const day = n.title.match(/^Your portfolio ([+-]?)(\d+(?:\.\d+)?)% today$/);
  if (!day) return null;
  const pct = Number(day[2]);
  const top = n.message.match(/· (\S+) ([+-]?)(\d+(?:\.\d+)?)% led$/);
  const lead = pct === 0
    ? 'Your stocks were flat at the last close.'
    : `Your stocks ${day[1] === '-' ? 'fell' : 'rose'} ${day[2]}% at the last close.`;
  return top ? `${lead} ${top[1]} moved most, ${top[2] === '-' ? 'down' : 'up'} ${top[3]}%.` : lead;
}

const SECTION_TITLES: Record<Section, string> = {
  earnings: 'Reporting today',
  move: 'Big moves at the last close',
  health: 'Health Score changes',
  politicians: 'Politicians trading your stocks',
  index: 'Index changes',
  dividend: 'Ex-dividend dates coming up',
  economic: 'On the calendar today',
};

/** What touches their money first, market-wide background last. Also the order the cap cuts in. */
const SECTION_ORDER: Section[] = ['earnings', 'move', 'health', 'politicians', 'index', 'dividend', 'economic'];

/**
 * BullPen's dark tokens (DESIGN.md) as hex, since mail clients don't read
 * CSS variables or oklch: the neutrals carry the faint green of bg-dark /
 * surface-dark, and color is spent only on gain/loss and the one CTA.
 */
const C = {
  bg: '#0b0f0d',
  surface: '#161b19',
  border: '#262b29',
  ink: '#fafafa',
  muted: '#a3a3a3',
  up: '#34d399',
  down: '#f87171',
  accent: '#3cc47c',
  accentInk: '#06210f',
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function withUtm(href: string): string {
  return `${APP_URL}${href}${href.includes('?') ? '&' : '?'}${UTM}`;
}

const bySection = (items: EmailItem[]) =>
  [...items].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));

/**
 * Names up to two alerts, in the email's own order, so the inbox line says
 * what happened rather than "plus 3 more". Kept near the ~60 characters a
 * phone shows.
 */
export function alertEmailSubject(items: EmailItem[]): string {
  const [a, b] = bySection(items);
  if (!b) return a.headline;
  const two = `${a.headline}, ${b.headline}`;
  const rest = items.length - 2;
  if (two.length <= 60) return rest ? `${two}, and ${rest} more` : two;
  return `${a.headline}, and ${items.length - 1} more`;
}

/** Inbox preview text: every alert in one line. Padded so the body doesn't leak in after it. */
function preheader(items: EmailItem[]): string {
  const text = bySection(items).map((i) => i.headline).join(' · ');
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${escapeHtml(text)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>`;
}

/** "Friday, October 23" in New York, the market's calendar. */
function marketDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }).format(now);
}

function card(i: EmailItem): string {
  const arrow = i.direction
    ? `<span aria-hidden="true" style="color:${i.direction === 'up' ? C.up : C.down};">${i.direction === 'up' ? '&#9650;' : '&#9660;'}</span>&nbsp;`
    : '';
  return `
          <tr><td style="padding:0 0 10px;">
            <a href="${escapeHtml(withUtm(i.href))}" style="display:block;text-decoration:none;background:${C.surface};border:1px solid ${C.border};border-radius:14px;padding:14px 16px;font-variant-numeric:tabular-nums;">
              <span style="display:block;font-size:16px;line-height:1.4;font-weight:600;color:${C.ink};">${arrow}${escapeHtml(i.headline)}</span>
              ${i.detail ? `<span style="display:block;margin-top:3px;font-size:14px;line-height:1.5;color:${C.muted};">${escapeHtml(i.detail)}</span>` : ''}
              ${i.why ? `<span style="display:block;margin-top:8px;font-size:14px;line-height:1.5;color:${C.ink};">${escapeHtml(i.why)}</span>` : ''}
              ${i.cue ? `<span style="display:block;margin-top:8px;font-size:14px;line-height:1.4;font-weight:600;color:${C.ink};">${escapeHtml(i.cue)}&nbsp;&rarr;</span>` : ''}
            </a>
          </td></tr>`;
}

/**
 * Table layout with the background on the table, not <body>: Gmail strips
 * body styles, which would leave light text on white. The footer lands at
 * the marker, inside the dark panel (lib/email/footer.ts).
 */
export function buildAlertEmailHtml(
  items: EmailItem[],
  opts: { first: boolean; joinedBeforeLaunch: boolean; unsubscribeUrl: string; recap?: string | null },
): string {
  const optOut = `Not for you? <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:${C.ink};text-decoration:underline;">Turn off these emails</a>.`;
  // A returning reader gets the recap in place of the generic line; a first one gets it after the explanation.
  const lead = !opts.first
    ? (opts.recap ? escapeHtml(opts.recap) : 'What happened with the stocks you follow.')
    : opts.joinedBeforeLaunch
      ? `You turned these alerts on when you joined. Until now they only showed up in the app. From today they also come here, one email in the morning, only when something happens to a stock you follow. ${optOut}`
      : `You turned these alerts on when you joined. They come here as one email in the morning, only when something happens to a stock you follow. ${optOut}`;
  const recapRow = opts.first && opts.recap
    ? `
        <tr><td style="padding:12px 0 0;font-size:15px;line-height:1.55;color:${C.ink};">${escapeHtml(opts.recap)}</td></tr>`
    : '';

  const shown = bySection(items).slice(0, MAX_CARDS);
  const hidden = items.length - shown.length;
  const sections = SECTION_ORDER.map((section) => {
    const rows = shown.filter((i) => i.section === section);
    if (!rows.length) return '';
    return `
          <tr><td style="padding:22px 0 10px;"><h2 style="margin:0;font-size:15px;line-height:1.3;font-weight:600;color:${C.muted};">${SECTION_TITLES[section]}</h2></td></tr>${rows.map(card).join('')}`;
  }).join('');
  const more = hidden
    ? `
          <tr><td style="padding:4px 0 0;font-size:15px;line-height:1.5;"><a href="${escapeHtml(withUtm('/notifications'))}" style="color:${C.ink};text-decoration:underline;">And ${hidden} more in BullPen</a></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>Your stocks this morning</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
  ${preheader(items)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
    <tr><td align="center" style="padding:28px 16px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:${FONT};">
        <tr><td style="padding:0 0 20px;font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">bullpen</td></tr>
        <tr><td><h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">${marketDate()}</h1></td></tr>
        <tr><td style="padding:8px 0 0;font-size:15px;line-height:1.55;color:${C.muted};">${lead}</td></tr>${recapRow}${sections}${more}
        <tr><td style="padding:16px 0 0;">
          <a href="${escapeHtml(withUtm('/dashboard'))}" style="display:inline-block;background:${C.accent};color:${C.accentInk};text-decoration:none;font-size:16px;line-height:1;font-weight:600;padding:15px 24px;border-radius:999px;">Open BullPen</a>
        </td></tr>
        <tr><td style="padding:12px 0 0;">${EMAIL_FOOTER_MARKER}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export interface AlertEmailRun {
  candidates: number;
  sent: number;
  skippedUnverified: number;
  skippedOptedOut: number;
  errors: string[];
  previews?: Array<{ userId: string; to: string; subject: string; html: string }>;
}

/**
 * Emails every verified, opted-in user their unsent alerts from the last 26h.
 * `dryRun` builds the emails without sending or marking anything; `userId`
 * limits the run to one account (testing).
 */
export async function sendMorningAlertEmails(opts: { dryRun?: boolean; userId?: string } = {}): Promise<AlertEmailRun> {
  const supabase = createServerClient();
  const run: AlertEmailRun = { candidates: 0, sent: 0, skippedUnverified: 0, skippedOptedOut: 0, errors: [] };
  if (opts.dryRun) run.previews = [];

  // Paged: PostgREST caps a response at 1000 rows, and a row cut here is never
  // emailed, since by the next run it is older than the lookback.
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const rows: AlertRow[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from('notifications')
      .select('id, user_id, type, entity_type, entity_id, title, message, created_at')
      .in('type', ['earnings', 'dividend', 'price_move', 'health_score', 'politician_trade', 'market'])
      .is('emailed_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (opts.userId) query = query.eq('user_id', opts.userId);
    const { data, error } = await query;
    if (error) {
      run.errors.push(`notifications: ${error.message}`);
      return run;
    }
    rows.push(...((data ?? []) as AlertRow[]));
    if (!data || data.length < 1000) break;
  }

  const byUser = new Map<string, { ids: string[]; items: EmailItem[] }>();
  const recaps = new Map<string, AlertRow>();
  const today = todayET();
  const etDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
  for (const row of rows) {
    // "Reports earnings today" is only true on the day it was written. The
    // 26h window would otherwise carry yesterday's row into this morning on
    // launch day or when the 08:00 cron drifts past this one.
    if (row.type === 'earnings' && etDay(row.created_at) !== today) continue;
    // Same for "CPI today at 8:30 AM ET": the entity id carries the release day.
    if (row.entity_id?.startsWith('economic:') && row.entity_id !== `economic:${today}`) continue;
    // The recap rides along with a real alert; it never sends an email on its own.
    if (row.entity_id?.startsWith('portfolio:daily_recap:')) {
      recaps.set(row.user_id, row);
      continue;
    }
    const item = toEmailItem(row);
    if (!item) continue;
    const entry = byUser.get(row.user_id) ?? { ids: [], items: [] };
    entry.ids.push(row.id);
    entry.items.push(item);
    byUser.set(row.user_id, entry);
  }
  run.candidates = byUser.size;
  if (!byUser.size) return run;

  // One read per stock, shared by everyone who holds it, all at once.
  const moves = [...byUser.values()].flatMap(({ items }) => items.filter((i) => i.symbol && i.movePct !== undefined));
  const whys = new Map<string, Promise<string | null>>();
  for (const item of moves) {
    if (!whys.has(item.symbol!)) whys.set(item.symbol!, cachedWhy(item.symbol!, item.movePct!).catch(() => null));
  }
  await Promise.all(
    moves.map(async (item) => {
      const why = await whys.get(item.symbol!)!;
      if (why) {
        item.why = why;
        item.cue = `More on ${item.symbol}`;
      }
    }),
  );

  const { data: users } = await supabase
    .from('users')
    .select('id, email, email_verified_at, settings, created_at')
    .in('id', [...byUser.keys()]);

  // Who has had one before: the first email explains why it is arriving. One
  // row per user at most, so the answer can't be cut off by the row cap.
  const returning = new Set<string>();
  await Promise.all(
    [...byUser.keys()].map(async (id) => {
      const { data } = await supabase.from('notifications').select('id').eq('user_id', id).not('emailed_at', 'is', null).limit(1);
      if (data?.length) returning.add(id);
    }),
  );

  for (const u of (users ?? []) as Array<{ id: string; email: string | null; email_verified_at: string | null; created_at: string; settings: { notifications?: Record<string, boolean> } | null }>) {
    const entry = byUser.get(u.id);
    if (!entry) continue;
    if (u.settings?.notifications?.email_alerts === false) {
      run.skippedOptedOut++;
      continue;
    }
    // Unverified addresses bounce or belong to someone else; both hurt every
    // other send's deliverability. Google sign-ins are verified at creation.
    if (!u.email || !u.email_verified_at) {
      run.skippedUnverified++;
      continue;
    }

    const unsub = unsubscribeUrl(u.id);
    const subject = alertEmailSubject(entry.items);
    const recap = recaps.get(u.id);
    if (recap) entry.ids.push(recap.id);
    const html = buildAlertEmailHtml(entry.items, {
      first: !returning.has(u.id),
      joinedBeforeLaunch: new Date(u.created_at) < new Date(EMAIL_LAUNCH),
      unsubscribeUrl: unsub,
      recap: recap ? recapLine(recap) : null,
    });

    if (opts.dryRun) {
      run.previews!.push({ userId: u.id, to: u.email, subject, html });
      continue;
    }

    try {
      await sendEmail({
        to: u.email,
        subject,
        html,
        // Alerts the user switched on: transactional per lib/email/footer.ts,
        // with the one-click opt-out linked anyway.
        kind: 'transactional',
        footer: {
          unsubscribeUrl: unsub,
          reason: 'You get this because you turned on stock alerts in BullPen.',
          unsubscribeLabel: 'Turn off these emails',
        },
        headers: {
          'List-Unsubscribe': `<${oneClickUrl(u.id)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: markErr } = await (supabase as any)
        .from('notifications')
        .update({ emailed_at: new Date().toISOString() })
        .in('id', entry.ids);
      if (markErr) run.errors.push(`mark ${u.id}: ${markErr.message}`);
      run.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[alert-email] send failed', { userId: u.id, msg });
      run.errors.push(`send ${u.id}: ${msg}`);
    }
  }

  return run;
}
