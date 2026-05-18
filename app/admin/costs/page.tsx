import { notFound } from 'next/navigation';
import { getSessionForApiRoute } from '@/lib/security/api-security';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { AdminCostsClient } from './AdminCostsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Costs' };

/**
 * Server-rendered admin gate. Any non-admin (anonymous, free, or pro user)
 * gets a real 404 — the route appears not to exist. The client bundle below
 * is only delivered to admins.
 */
export default async function AdminCostsPage() {
  const session = await getSessionForApiRoute();
  if (!session) notFound();

  const tier = await getTier(session.userId);
  if (!isAdmin(tier)) notFound();

  return <AdminCostsClient />;
}
