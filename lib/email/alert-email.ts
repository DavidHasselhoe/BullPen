/**
 * The morning alert email: one email a day, only when something happened,
 * carrying the earnings, ex-dividend and big-move notifications a user turned
 * on. Before this those only ever landed in the in-app panel, and the
 * 2026-10-23 activation check found none of 14 new users had read one.
 *
 * Built from the notifications the 08:00 and 21:30 crons already wrote, so it
 * adds no data or AI cost and inherits each per-type toggle. `emailed_at`
 * (migration 181) keeps an alert from going out twice. English only for now:
 * the rows carry an English title/message beside their i18n params.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { emailShell } from '@/lib/email/billing-reminder';
import { logger } from '@/lib/utils/logger';
import { SITE_URL } from '@/lib/site';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
/** The crons write at 08:00 and 21:30 UTC; 26h covers both with slack for drift. */
const LOOKBACK_MS = 26 * 60 * 60 * 1000;
const UTM = 'utm_source=email&utm_medium=alert&utm_campaign=morning_alert';

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

type Section = 'earnings' | 'dividend' | 'move';

interface EmailItem {
  section: Section;
  /** Big moves only: an arrow beside the colour, never colour alone. */
  direction?: 'up' | 'down';
  headline: string;
  detail: string;
  href: string;
}

// ─── Unsubscribe token ───────────────────────────────────────────────────────

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

const leadingTicker = (title: string) => title.match(/^([A-Z]{1,6}(?:\/[A-Z]{1,6})?)\b/)?.[1] ?? null;

/**
 * The three alert kinds onboarding offers, worded for a morning read. Custom
 * price alerts (entity 'user_alert') and the daily portfolio recap are left
 * out: neither is one of those three choices.
 */
export function toEmailItem(n: AlertRow): EmailItem | null {
  const one = leadingTicker(n.title);
  if ((n.type === 'earnings' || n.type === 'dividend') && n.entity_type === 'portfolio') {
    return {
      section: n.type === 'earnings' ? 'earnings' : 'dividend',
      headline: n.title,
      detail: n.message,
      href: one ? `/stock/${one}` : '/tools/calendar',
    };
  }
  if (n.type !== 'price_move') return null;
  const single = n.entity_type === 'stock' && n.entity_id?.endsWith(':price_move');
  const digest = n.entity_id === 'portfolio:price_digest_gain' || n.entity_id === 'portfolio:price_digest_loss';
  if (!single && !digest) return null;
  const down = n.entity_id === 'portfolio:price_digest_loss' || (single && /-\d/.test(n.title));
  return {
    section: 'move',
    direction: down ? 'down' : 'up',
    // Written at the close as "... today"; read the next morning, so the
    // section heading carries the timing instead.
    headline: n.title.replace(/ today\b/, ''),
    detail: n.message,
    href: single && n.entity_id ? `/stock/${n.entity_id.split(':')[0]}` : '/dashboard',
  };
}

const SECTION_TITLES: Record<Section, string> = {
  earnings: 'Reporting today',
  dividend: 'Ex-dividend dates coming up',
  move: 'Big moves at the last close',
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function withUtm(href: string): string {
  return `${APP_URL}${href}${href.includes('?') ? '&' : '?'}${UTM}`;
}

const SECTION_ORDER: Section[] = ['earnings', 'dividend', 'move'];

/** Leads with what the email leads with: today's reports before last night's moves. */
export function alertEmailSubject(items: EmailItem[]): string {
  const first = [...items].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section))[0].headline;
  return items.length === 1 ? first : `${first}, plus ${items.length - 1} more`;
}

export function buildAlertEmailHtml(items: EmailItem[], opts: { first: boolean; unsubscribeUrl: string }): string {
  const intro = opts.first
    ? `<p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #94a3b8;">
      You turned these alerts on when you joined BullPen. Until now they only showed up in the app, so from today we also send them here: one email in the morning, only when something happens to a stock you follow.
      Not for you? <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color: #94a3b8; text-decoration: underline;">Turn off these emails</a>.
    </p>`
    : '';

  const sections = SECTION_ORDER
    .map((section) => {
      const rows = items.filter((i) => i.section === section);
      if (!rows.length) return '';
      const list = rows
        .map(
          (i) => `
      <a href="${escapeHtml(withUtm(i.href))}" style="display: block; text-decoration: none; padding: 12px 14px; margin: 0 0 8px; background: #1e293b; border-radius: 8px;">
        <span style="display: block; font-size: 15px; font-weight: 600; color: #e2e8f0;">${i.direction ? `<span style="color: ${i.direction === 'up' ? '#22c55e' : '#ef4444'};">${i.direction === 'up' ? '▲' : '▼'}</span> ` : ''}${escapeHtml(i.headline)}</span>
        ${i.detail ? `<span style="display: block; margin-top: 2px; font-size: 13px; color: #94a3b8;">${escapeHtml(i.detail)}</span>` : ''}
      </a>`
        )
        .join('');
      return `
    <p style="margin: 20px 0 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b;">${SECTION_TITLES[section]}</p>${list}`;
    })
    .join('');

  return emailShell(
    'Your stocks this morning',
    `${intro}${sections}
    <p style="margin: 20px 0 0;">
      <a href="${escapeHtml(withUtm('/dashboard'))}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">Open BullPen</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      Choose which alerts you get in Settings, under Notifications.
    </p>`
  );
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

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  let query = supabase
    .from('notifications')
    .select('id, user_id, type, entity_type, entity_id, title, message, created_at')
    .in('type', ['earnings', 'dividend', 'price_move'])
    .is('emailed_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  const { data: rows, error } = await query;
  if (error) {
    run.errors.push(`notifications: ${error.message}`);
    return run;
  }

  const byUser = new Map<string, { ids: string[]; items: EmailItem[] }>();
  for (const row of (rows ?? []) as AlertRow[]) {
    const item = toEmailItem(row);
    if (!item) continue;
    const entry = byUser.get(row.user_id) ?? { ids: [], items: [] };
    entry.ids.push(row.id);
    entry.items.push(item);
    byUser.set(row.user_id, entry);
  }
  run.candidates = byUser.size;
  if (!byUser.size) return run;

  const { data: users } = await supabase
    .from('users')
    .select('id, email, email_verified_at, settings')
    .in('id', [...byUser.keys()]);

  // Who has had one before: the first email explains why it is arriving.
  const { data: emailedBefore } = await supabase
    .from('notifications')
    .select('user_id')
    .in('user_id', [...byUser.keys()])
    .not('emailed_at', 'is', null);
  const returning = new Set(((emailedBefore ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));

  for (const u of (users ?? []) as Array<{ id: string; email: string | null; email_verified_at: string | null; settings: { notifications?: Record<string, boolean> } | null }>) {
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
    const html = buildAlertEmailHtml(entry.items, { first: !returning.has(u.id), unsubscribeUrl: unsub });

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
        footer: { unsubscribeUrl: unsub },
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
