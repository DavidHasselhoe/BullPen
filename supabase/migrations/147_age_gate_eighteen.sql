-- Raise the signup age floor from 13 to 18.
--
-- 146 set it at 13, the COPPA floor, and flagged the 13-to-17 question as a
-- policy decision rather than guessing at it. The decision (David, 2026-09-22):
-- 18, on the grounds that 18 is when someone can open a brokerage account, so
-- a product built around holdings, brokerage sync and a paid subscription has
-- no audience below it. A Pro subscription is also a contract, and a minor's
-- contract is voidable.
--
-- Side effect worth knowing: this makes COPPA moot rather than merely handled.
-- Nobody under 13 can hold an account, so there is no under-13 personal
-- information to protect in the first place.
--
-- Keep in step with MIN_SIGNUP_AGE_YEARS in lib/auth/age-gate.ts.
CREATE OR REPLACE FUNCTION public.enforce_signup_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  min_age_years constant int := 18;
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

-- When the account was created, the terms were accepted, and the account
-- holder represented that they are of age. Recorded because an unrecorded
-- checkbox is not evidence of anything: enforcing a subscription against a
-- chargeback, or against a "I was a minor" claim, needs a date.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

COMMENT ON COLUMN public.users.terms_accepted_at IS
  'When the signup form''s terms and 18-or-over confirmation was accepted. Null for accounts created before it existed (2026-09-22).';

-- Same treatment as date_of_birth: carried from signup metadata into the
-- profile row, since the row is created by this trigger and not by the client.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  raw_dob text := NEW.raw_user_meta_data->>'date_of_birth';
  dob date;
  accepted timestamptz := NULL;
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

  IF (NEW.raw_user_meta_data->>'terms_accepted') = 'true' THEN
    accepted := NOW();
  END IF;

  INSERT INTO public.users (id, email, created_at, date_of_birth, terms_accepted_at)
  VALUES (NEW.id, NEW.email, NOW(), dob, accepted)
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts

  RETURN NEW;
END;
$$;

-- Set alongside the date of birth by AgeCheckGate, for an account that predates
-- the gate or arrived through Google.
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

  UPDATE public.users
     SET date_of_birth = dob,
         terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
         updated_at = NOW()
   WHERE id = caller;
END;
$$;
