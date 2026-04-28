/**
 * One-time script: clear all files from the company-logos Supabase Storage bucket.
 * Run BEFORE deploying the new logo-caching logic so stale/mismatched files don't persist.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/clear-logo-bucket.ts
 *   OR (if using tsx):
 *   npx tsx scripts/clear-logo-bucket.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'company-logos';
const BATCH_SIZE = 100;

async function clearLogoBucket() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Clearing bucket: ${BUCKET}`);
  let totalDeleted = 0;
  let offset = 0;

  while (true) {
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: BATCH_SIZE, offset });

    if (error) {
      console.error('Error listing files:', error.message);
      process.exit(1);
    }

    if (!files || files.length === 0) break;

    const paths = files.map((f) => f.name);
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove(paths);

    if (deleteError) {
      console.error('Error deleting files:', deleteError.message);
      process.exit(1);
    }

    totalDeleted += paths.length;
    console.log(`  Deleted ${paths.length} files (total: ${totalDeleted})`);

    if (files.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(`Done. Deleted ${totalDeleted} files from '${BUCKET}'.`);
}

clearLogoBucket().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
