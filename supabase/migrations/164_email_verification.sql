-- Our own "this inbox is real" signal, so Supabase's Confirm email setting can
-- be turned off (email signups get into the app straight away) without losing
-- it: with that setting off Supabase stamps email_confirmed_at on every signup.
-- A verified email is required to start the Pro trial, so the trial-terms
-- email and the reminder before the first charge reach a real inbox.
--
-- Set by: the backfill below, /auth/verify-email (our signed link), and the
-- Google identity trigger below.

alter table public.users add column if not exists email_verified_at timestamptz;

-- Confirm email was on for every account created so far (none unconfirmed at
-- the time of writing), so Supabase's own timestamp is a real proof here.
update public.users u
set email_verified_at = a.email_confirmed_at
from auth.users a
where a.id = u.id
  and a.email_confirmed_at is not null
  and u.email_verified_at is null;

-- A Google identity with a Google-verified address proves the inbox.
--
-- It also closes pre-account takeover. Supabase links a Google sign-in to an
-- existing account with the same email, and only protects against a stranger
-- having registered that address first by dropping UNCONFIRMED identities.
-- With Confirm email off every password signup counts as confirmed, so we do
-- it ourselves: a password set on an address nobody ever proved could belong
-- to whoever typed it, so it is disabled (password reset still works, it goes
-- to the real inbox) and that account's existing sessions are revoked. Runs
-- before Supabase issues the Google session, so the owner stays signed in.
create or replace function public.on_auth_identity_linked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'email'
     or coalesce((new.identity_data->>'email_verified')::boolean, false) is not true
     or lower(new.identity_data->>'email') is distinct from
        lower((select email from auth.users where id = new.user_id)) then
    return new;
  end if;

  if exists (select 1 from public.users where id = new.user_id and email_verified_at is null)
     and exists (select 1 from auth.identities where user_id = new.user_id and provider = 'email') then
    update auth.users set encrypted_password = '' where id = new.user_id;
    delete from auth.sessions where user_id = new.user_id;
  end if;

  update public.users set email_verified_at = now()
  where id = new.user_id and email_verified_at is null;
  return new;
exception when others then
  -- Never block a Google sign-in over this; the trial gate still holds.
  raise warning 'on_auth_identity_linked failed for %: %', new.user_id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.on_auth_identity_linked() from public, anon, authenticated;

drop trigger if exists on_auth_identity_linked on auth.identities;
create trigger on_auth_identity_linked
  after insert on auth.identities
  for each row execute function public.on_auth_identity_linked();
