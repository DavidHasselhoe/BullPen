import { createServerClient } from '@/lib/supabase/client';
import { isProfilePublic } from '@/lib/social/visibility';

export interface AuthorLabel {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

/**
 * Name and avatar to show beside something a member chose to post (a thesis,
 * a reply). Read with the service role because RLS hides private profiles from
 * other members: the handle is always shown, since posting is itself public,
 * but the real name and photo only when the profile is public.
 */
export async function loadAuthorLabels(userIds: string[]): Promise<Map<string, AuthorLabel>> {
  const map = new Map<string, AuthorLabel>();
  if (userIds.length === 0) return map;

  const { data } = (await createServerClient()
    .from('users')
    .select('id, username, full_name, avatar_url, settings')
    .in('id', userIds)) as unknown as {
    data: Array<{ id: string; username: string | null; full_name: string | null; avatar_url: string | null; settings: Record<string, unknown> | null }> | null;
  };

  for (const p of data ?? []) {
    const isPublic = isProfilePublic(p.settings);
    map.set(p.id, {
      username: p.username,
      full_name: isPublic ? p.full_name : null,
      avatar_url: isPublic ? p.avatar_url : null,
    });
  }
  return map;
}
