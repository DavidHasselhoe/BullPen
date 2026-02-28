-- Migration: Create user-avatars storage bucket
-- Note: Storage buckets are typically created via the Supabase Dashboard or API
-- This SQL provides documentation on the bucket configuration needed

-- Bucket Configuration:
-- Name: user-avatars
-- Public: true (allows public URL access)
-- File size limit: 5 MB
-- Allowed MIME types: image/jpeg, image/png, image/webp

-- To create the bucket manually:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: user-avatars
-- 4. Public bucket: ✓ (checked)
-- 5. File size limit: 5 MB
-- 6. Allowed MIME types: image/jpeg, image/png, image/webp
-- 7. Click "Create bucket"

-- RLS Policies (set these in Supabase Dashboard > Storage > user-avatars > Policies):
-- 
-- Policy 1: Allow public read access
-- Name: Public avatar reads
-- Target roles: public
-- Operation: SELECT
-- USING expression: bucket_id = 'user-avatars'
--
-- Policy 2: Allow authenticated users to upload avatars
-- Name: Authenticated users can upload avatars
-- Target roles: authenticated
-- Operation: INSERT
-- WITH CHECK expression: bucket_id = 'user-avatars'
--
-- Policy 3: Allow authenticated users to update avatars
-- Name: Authenticated users can update avatars
-- Target roles: authenticated
-- Operation: UPDATE
-- USING expression: bucket_id = 'user-avatars'
-- WITH CHECK expression: bucket_id = 'user-avatars'
--
-- Policy 4: Allow authenticated users to delete avatars
-- Name: Authenticated users can delete avatars
-- Target roles: authenticated
-- Operation: DELETE
-- USING expression: bucket_id = 'user-avatars'
--
-- Note: Files are stored at root level as ${userId}.${extension}
-- Application logic ensures users only upload/update/delete their own files

COMMENT ON TABLE users IS 'User avatars are stored in the user-avatars storage bucket. The bucket must be created manually in the Supabase Dashboard. File naming: {user_id}.{extension}';
