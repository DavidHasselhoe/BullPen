-- 119_avatar_storage_select_policy.sql
-- Fixes: profile picture upload fails with "new row violates row-level
-- security policy" / permission denied for every user, reproduced live
-- 2026-09-01.
--
-- Root cause: storage.objects has RLS enabled, and migration 106 left only
-- INSERT/UPDATE/DELETE policies on the user-avatars bucket -- no SELECT
-- policy for the authenticated role. Migration 079 deliberately dropped the
-- old public SELECT policy on the reasoning that public buckets serve object
-- bytes via the public URL endpoint without consulting storage.objects RLS,
-- so a SELECT policy only enabled `.list()`-based filename enumeration --
-- true, but it missed that Supabase Storage's own upload/upsert endpoint
-- issues `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING *`, and
-- Postgres RLS requires the SELECT policy to be satisfied to return the
-- row from that RETURNING clause, even though the INSERT/UPDATE WITH CHECK
-- conditions already passed. With no SELECT policy at all, every upload was
-- rejected regardless of ownership.
--
-- Fix: add a SELECT policy scoped the same way as the existing owner-only
-- UPDATE/DELETE policies (own file only, not a blanket "bucket_id =
-- 'user-avatars'"), so this doesn't reopen the filename-enumeration gap
-- migration 079 closed -- a user can only ever satisfy this for their own
-- `${auth.uid()}.${extension}` object.
create policy "Users can view their own avatar"
on storage.objects for select
to authenticated
using (
  bucket_id = 'user-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);
