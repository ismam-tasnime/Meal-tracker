-- Hardening pass in response to Supabase's security advisor after 0001:
--   1. set_updated_at / lock_meal_record_identity had a mutable search_path.
--   2. is_admin() was directly callable via PostgREST RPC by both anon and
--      authenticated. anon never needed it (no anon-facing policy calls
--      it) and authenticated only needs it *inside* RLS policy evaluation,
--      not as a public endpoint. Moving it to a schema PostgREST doesn't
--      expose removes the RPC surface while RLS can still call it directly.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Fix mutable search_path on trigger functions
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.lock_meal_record_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.employee_id <> old.employee_id or new.meal_date <> old.meal_date then
    raise exception 'employee_id and meal_date cannot be changed on an existing meal record';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create is_admin() in a schema PostgREST does not expose, so it can no
-- longer be called as /rest/v1/rpc/is_admin, while remaining usable inside
-- RLS policies (which run as the querying role, not over the REST API).
-- ---------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.admin_profiles where id = auth.uid()
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
-- Deliberately no grant to anon: no anon-facing policy needs it.

-- Repoint every RLS policy that referenced public.is_admin() at private.is_admin()
-- before dropping the old function, since the policies depend on it.

drop policy if exists employees_admin_insert on public.employees;
create policy employees_admin_insert
  on public.employees for insert
  to authenticated
  with check (private.is_admin());

drop policy if exists employees_admin_update on public.employees;
create policy employees_admin_update
  on public.employees for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists employees_admin_delete on public.employees;
create policy employees_admin_delete
  on public.employees for delete
  to authenticated
  using (private.is_admin());

drop policy if exists meal_records_admin_delete on public.meal_records;
create policy meal_records_admin_delete
  on public.meal_records for delete
  to authenticated
  using (private.is_admin());

drop policy if exists meal_prices_admin_select on public.meal_prices;
create policy meal_prices_admin_select
  on public.meal_prices for select
  to authenticated
  using (private.is_admin());

drop policy if exists meal_prices_admin_insert on public.meal_prices;
create policy meal_prices_admin_insert
  on public.meal_prices for insert
  to authenticated
  with check (private.is_admin());

drop policy if exists meal_prices_admin_update on public.meal_prices;
create policy meal_prices_admin_update
  on public.meal_prices for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists meal_prices_admin_delete on public.meal_prices;
create policy meal_prices_admin_delete
  on public.meal_prices for delete
  to authenticated
  using (private.is_admin());

-- Now nothing references public.is_admin() anymore; remove it.
drop function if exists public.is_admin();
