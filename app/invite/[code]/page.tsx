import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { InviteLanding } from './InviteLanding';

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Who sent the link, as little as possible: a first name, or nothing.
 * Profiles are private by default, so the full name, username and avatar
 * stay off a page anyone holding the link can open.
 */
async function loadInviter(code: string): Promise<{ firstName: string | null } | null> {
  if (!/^[a-f0-9]{10}$/i.test(code)) return null;
  const { data } = await createServerClient()
    .from('users')
    .select('full_name')
    .eq('invite_code', code.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const first = (data as { full_name: string | null }).full_name?.trim().split(/\s+/)[0] ?? null;
  return { firstName: first || null };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT(await getRequestLocale(), '/invite');
  return {
    title: t('auth:inviteMetaTitle'),
    description: t('auth:inviteOffer'),
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  const [inviter, userId, t] = await Promise.all([
    loadInviter(code),
    getCurrentUserId().catch(() => null),
    getRequestLocale().then((l) => getServerT(l, '/invite')),
  ]);
  if (!inviter) notFound();

  return (
    <InviteLanding
      signedIn={Boolean(userId)}
      copy={{
        headline: inviter.firstName
          ? t('auth:inviteHeadline', { name: inviter.firstName })
          : t('auth:inviteHeadlineAnonymous'),
        body: t('auth:inviteBody'),
        offer: t('auth:inviteOffer'),
        cta: t('auth:inviteCta'),
        signedIn: t('auth:inviteSignedIn'),
        signedInCta: t('auth:inviteSignedInCta'),
      }}
    />
  );
}
