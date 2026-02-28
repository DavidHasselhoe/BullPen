/**
 * Script to set a user's account_tier to Gold (3)
 * Usage: npx tsx scripts/set-user-gold-tier.ts <user-email>
 *    or: npm run set-gold-tier -- <user-email>
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setUserGoldTier(email: string) {
  console.log(`Setting account_tier to 3 (Gold) for user: ${email}`);

  const { data, error } = await supabase
    .from('users')
    .update({ account_tier: 3 })
    .eq('email', email)
    .select('id, email, account_tier');

  if (error) {
    console.error('Error updating user:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log('✅ Successfully updated user:');
  console.log(JSON.stringify(data[0], null, 2));
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: tsx scripts/set-user-gold-tier.ts <user-email>');
  process.exit(1);
}

setUserGoldTier(email).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
