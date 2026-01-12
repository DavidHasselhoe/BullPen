/**
 * Script to create the company-logos storage bucket in Supabase
 * Run this once to set up logo storage
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createServerClient } from '../lib/supabase/client';

config({ path: resolve(process.cwd(), '.env.local') });

const BUCKET_NAME = 'company-logos';

async function createLogoBucket() {
  console.log(`Creating storage bucket '${BUCKET_NAME}' in Supabase...`);

  const supabase = createServerClient();

  try {
    // Check if bucket already exists
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }

    const bucketExists = existingBuckets?.some((bucket) => bucket.name === BUCKET_NAME);

    if (bucketExists) {
      console.log(`✓ Bucket '${BUCKET_NAME}' already exists.`);
      return;
    }

    // Note: Creating buckets programmatically requires service role key or admin access
    // This will fail with a regular anon/service role key - buckets must be created in dashboard
    // However, we can try to use the admin API if SUPABASE_SERVICE_ROLE_KEY is available
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceRoleKey) {
      console.log('\n⚠️  Cannot create bucket programmatically without SUPABASE_SERVICE_ROLE_KEY.');
      console.log('\n📝 Please create the bucket manually in Supabase Dashboard:');
      console.log('   1. Go to https://supabase.com/dashboard');
      console.log(`   2. Select your project`);
      console.log('   3. Navigate to Storage');
      console.log(`   4. Click "New bucket"`);
      console.log(`   5. Name: ${BUCKET_NAME}`);
      console.log('   6. Public bucket: ✓ (checked)');
      console.log('   7. File size limit: 10 MB (or as needed)');
      console.log('   8. Allowed MIME types: image/jpeg, image/png, image/svg+xml');
      console.log('   9. Click "Create bucket"');
      console.log('\n   Then run this script again to verify it was created.');
      return;
    }

    // Try to create bucket using service role (admin) access
    // Note: This requires the storage API to support bucket creation via REST API
    // Most Supabase projects require bucket creation via dashboard
    console.log('\n⚠️  Bucket creation via API is not always supported.');
    console.log('\n📝 Please create the bucket manually in Supabase Dashboard:');
    console.log('   1. Go to https://supabase.com/dashboard');
    console.log(`   2. Select your project`);
    console.log('   3. Navigate to Storage');
    console.log(`   4. Click "New bucket"`);
    console.log(`   5. Name: ${BUCKET_NAME}`);
    console.log('   6. Public bucket: ✓ (checked)');
    console.log('   7. File size limit: 10 MB (or as needed)');
    console.log('   8. Allowed MIME types: image/jpeg, image/png, image/svg+xml');
    console.log('   9. Click "Create bucket"');
    console.log('\n   After creating the bucket, you may need to set up RLS policies:');
    console.log('   - Allow authenticated users to INSERT (upload)');
    console.log('   - Allow public SELECT (read) for public URLs');
    console.log('\n   Then run this script again to verify it was created.');

  } catch (error) {
    console.error('Error creating bucket:', error);
  }
}

// Run the script
createLogoBucket()
  .then(() => {
    console.log('\n✅ Script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
