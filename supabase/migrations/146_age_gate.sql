-- Age gate (COPPA): record date of birth at signup and refuse accounts for
-- children under 13.
--
-- Signup runs client-side (supabase.auth.signUp straight from the browser),
-- so form validation alone is not a boundary: the anon key is public and the
-- endpoint can be called directly. The rules below are the server-side half.
-- The client collects the date and shows a neutral age screen; this enforces
-- it no matter who is calling.
--
-- 13 is the COPPA floor, not a product decision about teenagers. If BullPen
-- decides it is 18+ (subscriptions are a contract, and brokerage-adjacent
-- products usually are), raise min_age_years below and the matching
-- constant in lib/auth/age-gate.ts.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth date;

COMMENT ON COLUMN public.users.date_of_birth IS
  'Self-reported DOB from the signup age gate. Null for accounts created before the gate existed (2026-09-22) — see lib/auth/age-gate.ts.';

-- A plain CHECK can't express this: the rule depends on the current date, and
-- CHECK bodies have to be immutable. Hence a trigger.
CREATE OR REPLACE FUNCTION public.enforce_signup_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  min_age_years constant int := 13;
BEGIN
  IF NEW.date_of_birth IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.date_of_birth > current_date THEN
    RAISE EXCEPTION 'date_of_birth cannot be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.date_of_birth > (current_date - (min_age_years || ' years')::interval) THEN
    RAISE EXCEPTION 'account holder must be at least % years old', min_age_years
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_signup_age ON public.users;
CREATE TRIGGER enforce_signup_age
  BEFORE INSERT OR UPDATE OF date_of_birth ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signup_age();

-- The profile row is created by this trigger on auth.users, so the DOB the
-- signup form passes as user metadata has to be carried across here. An
-- under-13 date raises inside the signUp transaction, which aborts it: no
-- auth user, no profile row, nothing retained about the child beyond the
-- request itself.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  raw_dob text := NEW.raw_user_meta_data->>'date_of_birth';
  dob date;
BEGIN
  IF raw_dob IS NOT NULL AND raw_dob <> '' THEN
    -- A malformed date is treated as absent rather than blowing up signup;
    -- the client validates the real thing before it ever gets here.
    BEGIN
      dob := raw_dob::date;
    EXCEPTION WHEN others THEN
      dob := NULL;
    END;
  END IF;

  INSERT INTO public.users (id, email, created_at, date_of_birth)
  VALUES (NEW.id, NEW.email, NOW(), dob)
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts

  RETURN NEW;
END;
$$;

-- Writing the DOB from the browser.
--
-- Migration 121 scoped this table's column grants, so `authenticated` has no
-- UPDATE on a newly added column and a direct .update() from the client fails.
-- Rather than widening the grant, the write goes through one function that can
-- state the whole rule: your own row, only when it is not already set, and the
-- age trigger above still gets the final say.
--
-- Write-once matters. If the column could be rewritten, an account could pass
-- the gate with a real date and then change it, and the value we rely on for
-- an age claim would be the last thing typed rather than the thing answered.
CREATE OR REPLACE FUNCTION public.set_own_date_of_birth(dob date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller uuid := (select auth.uid());
  existing date;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT u.date_of_birth INTO existing FROM public.users u WHERE u.id = caller;

  IF existing IS NOT NULL THEN
    RAISE EXCEPTION 'date_of_birth is already set' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.users SET date_of_birth = dob, updated_at = NOW() WHERE id = caller;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_date_of_birth(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_date_of_birth(date) TO authenticated;

-- anon inherited SELECT/UPDATE on the new column from the table-level grant it
-- still holds for pre-121 columns. No RLS policy lets an anonymous request
-- match a row, but an unauthenticated role has no business with this column at
-- all, so take it away rather than rely on that.
REVOKE SELECT, UPDATE, INSERT ON public.users FROM anon;
