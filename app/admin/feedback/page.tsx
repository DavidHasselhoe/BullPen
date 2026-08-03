import { notFound } from 'next/navigation';
import { getSessionForApiRoute } from '@/lib/security/api-security';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { AdminFeedbackClient } from './AdminFeedbackClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Feedback' };

/**
 * Server-rendered admin gate. Any non-admin (anonymous, free, or pro user)
 * gets a real 404 — the route appears not to exist. The client bundle below
 * is only delivered to admins. Same pattern as /admin/costs.
 */
export default async function AdminFeedbackPage() {
  const session = await getSessionForApiRoute();
  if (!session) notFound();

  const tier = await getTier(session.userId);
  if (!isAdmin(tier)) notFound();

  return <AdminFeedbackClient />;
}
