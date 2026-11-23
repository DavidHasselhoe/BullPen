import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase/client';
import UsersPageClient from './UsersPageClient';

// A near-empty member list makes BullPen look deserted; 20 is the bar David chose before showing it.
const MIN_PUBLIC_PROFILES_FOR_LIST = 20;

// Same rule as isProfilePublic (lib/social/visibility.ts): only an explicit true.
// Throws on error so a failed read isn't cached as a count.
const countPublicProfiles = unstable_cache(
  async () => {
    const { count, error } = await createServerClient()
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('settings->>profile_public', 'true');
    if (error) throw error;
    return count ?? 0;
  },
  ['public-profile-count'],
  { revalidate: 3600 },
);

export default async function UsersPage() {
  let count = 0;
  try {
    count = await countPublicProfiles();
  } catch (err) {
    console.error('[users] public profile count failed', err);
  }
  // Query strings (?q=) are dropped on purpose: Discover has no member search.
  if (count < MIN_PUBLIC_PROFILES_FOR_LIST) redirect('/discover');
  return <UsersPageClient />;
}
