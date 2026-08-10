import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/client';

/**
 * page.tsx is a client component, so this sibling server layout carries the
 * metadata. Deliberately re-reads the same profile_public gate the profile
 * API route enforces (app/api/users/[username]/route.ts) rather than
 * assuming it's public — a private profile must fall back to the generic
 * site title here too, not leak a name into search results or link
 * previews just because metadata generation runs unauthenticated.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const supabase = createServerClient();

  const { data } = await supabase
    .from('users')
    .select('username, full_name, bio, settings')
    .eq('username', username)
    .maybeSingle<{
      username: string;
      full_name: string | null;
      bio: string | null;
      settings: Record<string, unknown> | null;
    }>();

  if (!data || data.settings?.profile_public === false) return {};

  const name = data.full_name || data.username;

  return {
    title: `${name} (@${data.username})`,
    description: data.bio || `${name}'s public investing profile on BullPen.`,
  };
}

export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
