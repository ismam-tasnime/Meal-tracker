-- Office Meal Management App — initial schema, indexes, triggers, and RLS policies
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  meal_date date not null,
  breakfast boolean not null default false,
  lunch boolean not null default false,
  dinner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_records_employee_date_unique unique (employee_id, meal_date)
);

-- Price history: a new row is inserted whenever the admin changes prices,
-- effective from a given date. The price applicable to a given meal_date is
-- the latest row whose effective_from <= meal_date. This keeps historical
-- monthly calculations correct even after a price change.
create table if not exists public.meal_prices (
  id uuid primary key default gen_random_uuid(),
  breakfast_price numeric(10, 2) not null check (breakfast_price >= 0),
  lunch_price numeric(10, 2) not null check (lunch_price >= 0),
  dinner_price numeric(10, 2) not null check (dinner_price >= 0),
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

-- Authorization: only rows explicitly inserted here (by a superadmin via the
-- Supabase SQL editor / service role) are treated as admins. Signing up for
-- Supabase Auth alone grants no privileges.
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_meal_records_employee_id on public.meal_records (employee_id);
create index if not exists idx_meal_records_meal_date on public.meal_records (meal_date);
create index if not exists idx_meal_prices_effective_from on public.meal_prices (effective_from desc);
create index if not exists idx_employees_is_active on public.employees (is_active);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists trg_meal_records_updated_at on public.meal_records;
create trigger trg_meal_records_updated_at
  before update on public.meal_records
  for each row execute function public.set_updated_at();

-- Prevent employee_id / meal_date from ever being changed on an existing
-- meal_records row (upserts only ever touch the boolean columns). Protects
-- data integrity given the table also allows anonymous writes.
create or replace function public.lock_meal_record_identity()
returns trigger
language plpgsql
as $$
begin
  if new.employee_id <> old.employee_id or new.meal_date <> old.meal_date then
    raise exception 'employee_id and meal_date cannot be changed on an existing meal record';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_meal_record_identity on public.meal_records;
create trigger trg_lock_meal_record_identity
  before update on public.meal_records
  for each row execute function public.lock_meal_record_identity();

-- ---------------------------------------------------------------------------
-- Authorization helper
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles where id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Monthly report aggregation (uses the price effective on each meal_date)
-- ---------------------------------------------------------------------------

create or replace function public.get_monthly_report(p_year int, p_month int)
returns table (
  employee_id uuid,
  employee_name text,
  is_active boolean,
  breakfast_count bigint,
  lunch_count bigint,
  dinner_count bigint,
  breakfast_amount numeric,
  lunch_amount numeric,
  dinner_amount numeric,
  total_amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select make_date(p_year, p_month, 1) as start_date,
           (make_date(p_year, p_month, 1) + interval '1 month')::date as end_date
  ),
  priced as (
    select
      mr.employee_id,
      mr.breakfast,
      mr.lunch,
      mr.dinner,
      (
        select mp.breakfast_price from public.meal_prices mp
        where mp.effective_from <= mr.meal_date
        order by mp.effective_from desc limit 1
      ) as breakfast_price,
      (
        select mp.lunch_price from public.meal_prices mp
        where mp.effective_from <= mr.meal_date
        order by mp.effective_from desc limit 1
      ) as lunch_price,
      (
        select mp.dinner_price from public.meal_prices mp
        where mp.effective_from <= mr.meal_date
        order by mp.effective_from desc limit 1
      ) as dinner_price
    from public.meal_records mr, bounds
    where mr.meal_date >= bounds.start_date and mr.meal_date < bounds.end_date
  )
  select
    e.id as employee_id,
    e.name as employee_name,
    e.is_active,
    coalesce(sum((priced.breakfast)::int), 0) as breakfast_count,
    coalesce(sum((priced.lunch)::int), 0) as lunch_count,
    coalesce(sum((priced.dinner)::int), 0) as dinner_count,
    coalesce(sum(case when priced.breakfast then priced.breakfast_price else 0 end), 0) as breakfast_amount,
    coalesce(sum(case when priced.lunch then priced.lunch_price else 0 end), 0) as lunch_amount,
    coalesce(sum(case when priced.dinner then priced.dinner_price else 0 end), 0) as dinner_amount,
    coalesce(sum(case when priced.breakfast then priced.breakfast_price else 0 end), 0)
      + coalesce(sum(case when priced.lunch then priced.lunch_price else 0 end), 0)
      + coalesce(sum(case when priced.dinner then priced.dinner_price else 0 end), 0) as total_amount
  from public.employees e
  left join priced on priced.employee_id = e.id
  group by e.id, e.name, e.is_active
  order by e.name;
$$;

revoke all on function public.get_monthly_report(int, int) from public;
grant execute on function public.get_monthly_report(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.meal_records enable row level security;
alter table public.meal_prices enable row level security;
alter table public.admin_profiles enable row level security;

-- employees: everyone (including anonymous public-panel visitors) can read
-- names/active status; only admins can add/edit/deactivate/remove.
drop policy if exists employees_select_all on public.employees;
create policy employees_select_all
  on public.employees for select
  to anon, authenticated
  using (true);

drop policy if exists employees_admin_insert on public.employees;
create policy employees_admin_insert
  on public.employees for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists employees_admin_update on public.employees;
create policy employees_admin_update
  on public.employees for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists employees_admin_delete on public.employees;
create policy employees_admin_delete
  on public.employees for delete
  to authenticated
  using (public.is_admin());

-- meal_records: intentionally public read AND write (no login) per the
-- product requirement that anyone with the link can view and toggle any
-- employee's meal status. No prices live on this table, so there is no
-- financial exposure. Only admins may delete a record outright.
drop policy if exists meal_records_select_all on public.meal_records;
create policy meal_records_select_all
  on public.meal_records for select
  to anon, authenticated
  using (true);

drop policy if exists meal_records_public_insert on public.meal_records;
create policy meal_records_public_insert
  on public.meal_records for insert
  to anon, authenticated
  with check (true);

drop policy if exists meal_records_public_update on public.meal_records;
create policy meal_records_public_update
  on public.meal_records for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists meal_records_admin_delete on public.meal_records;
create policy meal_records_admin_delete
  on public.meal_records for delete
  to authenticated
  using (public.is_admin());

-- meal_prices: admin-only in every direction. Never exposed to anon.
drop policy if exists meal_prices_admin_select on public.meal_prices;
create policy meal_prices_admin_select
  on public.meal_prices for select
  to authenticated
  using (public.is_admin());

drop policy if exists meal_prices_admin_insert on public.meal_prices;
create policy meal_prices_admin_insert
  on public.meal_prices for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists meal_prices_admin_update on public.meal_prices;
create policy meal_prices_admin_update
  on public.meal_prices for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists meal_prices_admin_delete on public.meal_prices;
create policy meal_prices_admin_delete
  on public.meal_prices for delete
  to authenticated
  using (public.is_admin());

-- admin_profiles: a signed-in user may read only their own row (to check
-- their own role client/server-side). No client may insert/update/delete —
-- admin accounts are provisioned via the Supabase SQL editor or service role.
drop policy if exists admin_profiles_self_select on public.admin_profiles;
create policy admin_profiles_self_select
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid());
