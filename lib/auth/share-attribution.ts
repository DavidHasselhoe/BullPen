import { createBrowserClient } from '@/lib/supabase/client';

const REF_COOKIE_NAME = 'bp_ref';

/** Reads the bp_ref cookie set by middleware on /share/[id], or null if absent. */
export function getShareRefCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * If a bp_ref cookie is present, asks the server to attribute this signup and
 * grant the "give a month, get a month" referral reward to both the new
 * signup and the share's owner (migrations 114/115/124 — bonus Pro access,
 * notifications on both sides). The RPC derives the caller from auth.uid()
 * and is itself idempotent (checks + sets settings.acquired_via_share_id
 * atomically), so this is safe to call on every login/signup completion —
 * a no-op whenever there's no cookie or the account is already attributed.
 */
export async function maybeClaimShareAttribution(): Promise<void> {
  const shareId = getShareRefCookie();
  if (!shareId) return;

  const supabase = createBrowserClient();
  await supabase.rpc('grant_share_referral_reward' as never, { share_id_param: shareId } as never);
}
