import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { SITE_URL } from '@/lib/site';
import { InviteLanding } from './InviteLanding';

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Who sent the link, as little as possible: a first name, or nothing.
 * Profiles are private by default, so the full name, username and avatar
 * stay off a page anyone holding the link can open. The id only decides
 * whether the visitor is looking at their own link; it is never rendered.
 * Shared by the metadata and the page, so one request is one lookup.
 */
const loadInviter = cache(async (code: string): Promise<{ id: string; firstName: string | null } | null> => {
  if (!/^[a-f0-9]{10}$/i.test(code)) return null;
  const { data } = await createServerClient()
    .from('users')
    .select('id, full_name')
    .eq('invite_code', code.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; full_name: string | null };
  // The headline marks its serif word with *stars*; a name can't add one.
  const first = row.full_name?.trim().split(/\s+/)[0]?.replace(/\*/g, '') ?? null;
  return { id: row.id, firstName: first || null };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const [inviter, userId, t] = await Promise.all([
    loadInviter(code),
    getCurrentUserId().catch(() => null),
    getRequestLocale().then((l) => getServerT(l, '/invite')),
  ]);
  return {
    // An unknown code renders not-found.tsx, so it must not say "You're invited";
    // nor should the inviter's own tab, checking the link before sending it.
    title: !inviter ? t('auth:inviteInvalidMetaTitle')
      : inviter.id === userId ? t('navigation:inviteLinkLabel')
      : t('auth:inviteMetaTitle'),
    description: inviter ? t('auth:inviteBody') : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  const [inviter, userId] = await Promise.all([loadInviter(code), getCurrentUserId().catch(() => null)]);
  if (!inviter) notFound();

  const state = !userId ? 'guest' : userId === inviter.id ? 'own' : 'member';
  return (
    <InviteLanding
      state={state}
      code={code.toLowerCase()}
      inviterName={inviter.firstName}
      url={`${SITE_URL}/invite/${code.toLowerCase()}`}
    />
  );
}
