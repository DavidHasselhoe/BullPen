import { createServerClient } from '@/lib/supabase/client';

export interface PortfolioShare {
  id: string;
  user_id: string | null;
  /** Snapshotted at share time — null when anonymous, independent of whether
   *  the account still exists or has since been renamed. */
  username: string | null;
  date: string;
  pct: number;
  pnl_usd: number | null;
  currency: string;
  sparkline: number[];
  anonymous: boolean;
  signup_count: number;
  created_at: string;
}

/**
 * Service-role lookup — used by the two PUBLIC routes (/share/[id],
 * /api/og/share/[id]). A logged-out visitor has no auth.uid(), so this
 * deliberately bypasses the owner-only RLS policies on portfolio_shares
 * rather than trying to route a service-role read through them.
 */
export async function getShareById(id: string): Promise<PortfolioShare | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('portfolio_shares')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as PortfolioShare;
}
