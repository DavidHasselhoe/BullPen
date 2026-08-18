import { notFound } from 'next/navigation';
import { getSessionForApiRoute } from '@/lib/security/api-security';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { AdminAcademyRoadmapClient } from './AdminAcademyRoadmapClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Academy Roadmap' };

/**
 * Server-rendered admin gate. Same pattern as /admin/feedback and
 * /admin/costs: any non-admin gets a real 404, the client bundle is only
 * delivered to admins.
 */
export default async function AdminAcademyRoadmapPage() {
  const session = await getSessionForApiRoute();
  if (!session) notFound();

  const tier = await getTier(session.userId);
  if (!isAdmin(tier)) notFound();

  return <AdminAcademyRoadmapClient />;
}
