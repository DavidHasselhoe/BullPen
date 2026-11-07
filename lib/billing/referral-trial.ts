import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICING } from './entitlements';

/**
 * How long this user's Pro trial is: 30 days if they signed up through an
 * invite or share link and haven't started that trial yet, otherwise the
 * usual 7. The checkout route (which sets the Stripe trial) and
 * /api/billing/trial (which the purchase pages read for their copy and
 * renewal terms) both call this, so the page can't promise a different
 * length from the one Stripe charges on.
 *
 * The referral's trial_started_at is set by the Stripe webhook through
 * claim_referral_trial (migration 198), which is also when the referrer earns
 * their month.
 */
export async function trialDaysFor(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_id', userId)
    .is('trial_started_at', null)
    .maybeSingle();
  return data ? PRICING.referralTrialDays : PRICING.trialDays;
}
