/**
 * Our own email verification (server only). Supabase's Confirm email setting
 * is off so email signups get straight in, which means Supabase marks every
 * address confirmed; `users.email_verified_at` is the real signal instead
 * (migration 164). Required before a trial starts.
 *
 * The link carries a stateless token: user id + address + expiry, signed with
 * a key derived from the service role key. Binding the address means a link
 * stops working if the account's email ever changes.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { emailShell } from '@/lib/email/billing-reminder';
import { SITE_URL } from '@/lib/site';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  // Derived with a label so this signature can never be mistaken for anything else signed with it.
  return createHmac('sha256', secret).update('bullpen:email-verify:v1').digest();
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function createVerifyToken(userId: string, email: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: email.toLowerCase(), x: now + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readVerifyToken(token: string, now = Date.now()): { userId: string; email: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof u !== 'string' || typeof e !== 'string' || typeof x !== 'number' || x < now) return null;
    return { userId: u, email: e };
  } catch {
    return null;
  }
}

export async function getVerificationState(userId: string): Promise<{ verified: boolean; email: string | null }> {
  const { data } = await createServerClient()
    .from('users')
    .select('email, email_verified_at')
    .eq('id', userId)
    .maybeSingle();
  const row = data as { email?: string | null; email_verified_at?: string | null } | null;
  return { verified: !!row?.email_verified_at, email: row?.email ?? null };
}

/** Marks the address verified if the token is valid and still matches the account's email. */
export async function markVerified(token: string): Promise<boolean> {
  const claim = readVerifyToken(token);
  if (!claim) return false;
  const supabase = createServerClient();
  const { data } = await supabase.from('users').select('email, email_verified_at').eq('id', claim.userId).maybeSingle();
  const row = data as { email?: string | null; email_verified_at?: string | null } | null;
  if (!row?.email || row.email.toLowerCase() !== claim.email) return false;
  if (row.email_verified_at) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('users')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('id', claim.userId);
  return !error;
}

export function buildVerifyEmailHtml(link: string): string {
  return emailShell(
    'Confirm your email',
    `
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      Confirm this is your address so we can send your trial details and the reminder before any charge.
    </p>
    <p style="margin: 20px 0 0;">
      <a href="${link}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">
        Confirm email
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      The link works for 7 days. If you didn't create a BullPen account, you can ignore this email.
    </p>`
  );
}

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const link = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(createVerifyToken(userId, email))}`;
  await sendEmail({
    to: email,
    subject: 'Confirm your email for BullPen',
    html: buildVerifyEmailHtml(link),
    kind: 'transactional',
  });
}

export function buildVerifyReminderHtml(link: string): string {
  return emailShell(
    'Your email still needs confirming',
    `
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      Once it's confirmed, BullPen can email you in the morning when something happens to a stock you follow. Until then, those alerts only show up in the app.
    </p>
    <p style="margin: 20px 0 0;">
      <a href="${link}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">
        Confirm email
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      This is the only reminder we send. If you didn't create a BullPen account, you can ignore this email.
    </p>`
  );
}

export interface VerifyReminderRun {
  candidates: number;
  sent: number;
  errors: string[];
}

/**
 * One reminder to email signups still unverified a day later; Google sign-ins
 * are verified at creation. No "sent" column: each daily run takes accounts
 * created 24-48h before the top of its hour, so every account falls in exactly
 * one run even when the cron starts a few minutes late. A skipped run skips
 * that day's signups, which is fine for a nudge.
 */
export async function sendVerificationReminders(opts: { dryRun?: boolean; now?: Date } = {}): Promise<VerifyReminderRun> {
  const hour = new Date(opts.now ?? Date.now());
  hour.setUTCMinutes(0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const { data, error } = await createServerClient()
    .from('users')
    .select('id, email')
    .is('email_verified_at', null)
    .not('email', 'is', null)
    .gte('created_at', new Date(hour.getTime() - 2 * day).toISOString())
    .lt('created_at', new Date(hour.getTime() - day).toISOString());
  const run: VerifyReminderRun = { candidates: data?.length ?? 0, sent: 0, errors: error ? [error.message] : [] };
  if (opts.dryRun) return run;

  for (const u of (data ?? []) as Array<{ id: string; email: string }>) {
    const link = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(createVerifyToken(u.id, u.email))}`;
    try {
      await sendEmail({
        to: u.email,
        subject: 'Confirm your email to get your stock alerts',
        html: buildVerifyReminderHtml(link),
        kind: 'transactional',
      });
      run.sent++;
    } catch (err) {
      run.errors.push(`${u.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}
