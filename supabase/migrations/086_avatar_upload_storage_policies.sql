-- Migration 019 documented the RLS policies the user-avatars bucket needs but
-- never actually created them via SQL (comments said to set them up manually
-- in the Supabase Dashboard). That apparently never happened -- avatar uploads
-- fail with a permission-denied error because there's no INSERT policy at all.
--
-- Migration 079 intentionally dropped the public SELECT ("Public avatar
-- reads") policy: public buckets serve object bytes via the public URL
-- endpoint without consulting storage.objects RLS, so a SELECT policy only
-- enabled `.list()`-based filename enumeration. Do not recreate it here.
--
-- Files are stored flat as `{userId}.{extension}` (see
-- lib/storage/avatar-upload.ts), so ownership is checked by comparing the
-- object name's prefix (before the extension) to the caller's own auth uid --
-- tighter than migration 019's original "bucket_id = 'user-avatars'" design,
-- which would have let any authenticated user overwrite or delete anyone
-- else's avatar file.

create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);

create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
)
with check (
  bucket_id = 'user-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);
