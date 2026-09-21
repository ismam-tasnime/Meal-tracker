-- First-admin bootstrap.
--
-- Admin accounts previously had to be provisioned by hand in the Supabase
-- dashboard. This adds a self-closing signup path instead: while zero admins
-- exist, a signed-in user may claim admin once; the moment the first admin
-- row exists the door shuts permanently and further attempts return false.
--
-- The guard lives in the database, not the UI, so it can't be bypassed by
-- calling the API directly. The worker functions are SECURITY DEFINER and
-- live in `private` (not exposed by PostgREST); the thin `public` wrappers
-- are SECURITY INVOKER, which is what the app calls via rpc().

-- ---------------------------------------------------------------------------
-- Has the first admin been created yet?
-- ---------------------------------------------------------------------------

create or replace function private.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (select 1 from public.admin_profiles);
$$;

revoke all on function private.admin_exists() from public;
grant usage on schema private to anon;
grant execute on function private.admin_exists() to anon, authenticated;

-- Public wrapper (SECURITY INVOKER) so the signup page can ask whether
-- registration is still open. Discloses exactly one bit: setup done or not.
create or replace function public.admin_setup_completed()
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select private.admin_exists();
$$;

revoke all on function public.admin_setup_completed() from public;
grant execute on function public.admin_setup_completed() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claim the first admin slot
-- ---------------------------------------------------------------------------

create or replace function private.claim_first_admin(p_full_name text)
returns boolean
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Must be signed in to claim admin access';
  end if;

  -- Serializes concurrent claims so two callers can't both observe an
  -- empty table and both become admins.
  lock table public.admin_profiles in exclusive mode;

  -- Already an admin: idempotent success.
  if exists (select 1 from public.admin_profiles where id = v_uid) then
    return true;
  end if;

  -- Someone else already claimed it: registration is closed.
  if exists (select 1 from public.admin_profiles) then
    return false;
  end if;

  insert into public.admin_profiles (id, full_name)
  values (v_uid, nullif(trim(coalesce(p_full_name, '')), ''));

  return true;
end;
$$;

revoke all on function private.claim_first_admin(text) from public;
grant execute on function private.claim_first_admin(text) to authenticated;

create or replace function public.claim_first_admin(p_full_name text)
returns boolean
language sql
volatile
security invoker
set search_path = public, private
as $$
  select private.claim_first_admin(p_full_name);
$$;

revoke all on function public.claim_first_admin(text) from public;
grant execute on function public.claim_first_admin(text) to authenticated;
