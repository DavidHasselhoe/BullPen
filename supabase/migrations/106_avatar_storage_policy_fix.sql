-- 106_avatar_storage_policy_fix.sql
-- Security audit finding: the user-avatars bucket carried two generations of
-- INSERT/UPDATE/DELETE policies — an old "any authenticated user, any object"
-- set ("Authenticated users can upload/update/delete avatars", with_check
-- just bucket_id = 'user-avatars') alongside a newer owner-scoped set ("Users
-- can upload/update/delete their own avatar", which also requires
-- split_part(name, '.', 1) = auth.uid()::text). Postgres RLS OR's all
-- PERMISSIVE policies together, so the old broad policy made the ownership
-- check on the newer ones unenforceable in practice: any logged-in user could
-- overwrite or delete any other user's avatar file by uploading to
-- "<their-user-id>.png". Dropping the broad policies leaves only the
-- owner-scoped ones in effect — verified against lib/storage/avatar-upload.ts,
-- which always uploads to `${own userId}.${extension}` and has no
-- upload-on-behalf-of-another-user path.
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;

-- Also close the MIME-type gap: the bucket had allowed_mime_types = null, so
-- Supabase Storage's own server-side type check was a no-op. The client-side
-- magic-byte sniff in lib/storage/avatar-upload.ts is real, but only runs in
-- the app's own upload path — a caller hitting the Storage REST API directly
-- (with a valid session) bypasses it entirely. This makes the allowlist a
-- second, server-side-enforced backstop.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'user-avatars';
