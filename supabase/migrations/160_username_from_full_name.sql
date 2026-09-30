-- The profile modal no longer asks for a username: people set one Name, and
-- the profile link (/users/<username>) is derived from it. Only 4 of 19
-- accounts had ever filled the username field in; everyone else had a
-- /users/<uuid> link.
--
-- Generated once, while username is still null, and never rewritten on a
-- later name change, so a shared profile link keeps working.

-- SECURITY DEFINER so the collision check sees every row, not just the ones
-- the caller's RLS lets it read. It only ever sets NEW.username.
CREATE OR REPLACE FUNCTION public.set_username_from_full_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  -- "Unge Hasselø" -> "unge-hasselo". NFD strips accents (é, å, ü); ø, æ, ß
  -- and friends are letters of their own and need mapping by hand.
  base := left(trim(BOTH '-' FROM regexp_replace(
    replace(replace(replace(
      translate(lower(regexp_replace(normalize(NEW.full_name, NFD), '[̀-ͯ]', '', 'g')), 'øđłð', 'odld'),
      'æ', 'ae'), 'ß', 'ss'), 'þ', 'th'),
    '[^a-z0-9]+', '-', 'g')), 40);
  IF base = '' THEN
    RETURN NEW;
  END IF;

  -- ponytail: check-then-insert, so two same-name signups in the same instant
  -- can still hit the UNIQUE constraint. Retry on unique_violation if that
  -- ever happens at real signup volume.
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE lower(username) = candidate AND id <> NEW.id) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;

  NEW.username := candidate;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_username_from_full_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_username_from_full_name ON public.users;
CREATE TRIGGER users_username_from_full_name
  BEFORE INSERT OR UPDATE OF full_name ON public.users
  FOR EACH ROW
  WHEN (NEW.username IS NULL AND NEW.full_name IS NOT NULL)
  EXECUTE FUNCTION public.set_username_from_full_name();

-- Backfill, one statement per row so each collision check sees the
-- usernames handed out before it. Oldest account gets the unsuffixed name.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.users WHERE username IS NULL AND full_name IS NOT NULL ORDER BY created_at LOOP
    UPDATE public.users SET full_name = full_name WHERE id = r.id;
  END LOOP;
END;
$$;
