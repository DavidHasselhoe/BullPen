-- Migration: Create company-logos storage bucket
-- Note: This migration creates the bucket if it doesn't exist
-- Storage buckets are typically created via the Supabase Dashboard or API
-- This SQL provides documentation on the bucket configuration needed

-- Bucket Configuration:
-- Name: company-logos
-- Public: true (allows public URL access)
-- File size limit: 10 MB
-- Allowed MIME types: image/jpeg, image/png, image/svg+xml

-- To create the bucket manually:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: company-logos
-- 4. Public bucket: ✓ (checked)
-- 5. File size limit: 10 MB
-- 6. Allowed MIME types: image/jpeg, image/png, image/svg+xml
-- 7. Click "Create bucket"

-- RLS Policies (set these in Supabase Dashboard > Storage > company-logos > Policies):
-- 
-- Policy 1: Allow authenticated users to upload
-- Name: Allow authenticated uploads
-- Target roles: authenticated
-- USING expression: true
-- WITH CHECK expression: true
-- Operations: INSERT
--
-- Policy 2: Allow public read access
-- Name: Allow public reads
-- Target roles: public
-- USING expression: true
-- WITH CHECK expression: false
-- Operations: SELECT

COMMENT ON TABLE companies IS 'Company logos are stored in the company-logos storage bucket. The bucket must be created manually in the Supabase Dashboard.';
