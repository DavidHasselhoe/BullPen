import { createBrowserClient } from '@/lib/supabase/client';

const REF_COOKIE_NAME = 'bp_ref';

/** Reads the bp_ref cookie set by middleware on /share/[id], or null if absent. */
export function getShareRefCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * If a bp_ref cookie is present and this account hasn't already been
 * attributed, tags settings.acquired_via_share_id and bumps that share's
 * signup_count. Safe to call on every login/signup completion — a no-op
 * whenever there's no cookie or the account is already attributed.
 */
export async function maybeClaimShareAttribution(userId: string): Promise<void> {
  const shareId = getShareRefCookie();
  if (!shareId) return;

  const supabase = createBrowserClient();
  const { data: row } = await supabase.from('users').select('settings').eq('id', userId).single();
  const settings = ((row as { settings: Record<string, unknown> } | null)?.settings) ?? {};
  if (settings.acquired_via_share_id) return;

  await supabase
    .from('users')
    .update({ settings: { ...settings, acquired_via_share_id: shareId } } as never)
    .eq('id', userId);

  await supabase.rpc('increment_share_signup_count' as never, { share_id: shareId } as never);
}
