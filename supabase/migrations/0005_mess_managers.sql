-- Multiple mess managers, each with a private dashboard.
--
-- The mess runs in periods that start on the 5th of one month and end the
-- day before the 5th of the next (e.g. 5 Jan – 4 Feb). Each period has one
-- mess manager. Anyone may now sign up as a mess manager (the one-time
-- first-admin bootstrap from 0003 is removed), but everything money-related
-- is scoped to the manager who owns the period:
--
--   * mess_periods      — a manager sees only their own periods.
--   * meal_prices       — every price row belongs to one period; only that
--                         period's manager can see or change it.
--   * get_period_report — only returns data for a period the caller owns.
--
-- Employees and the public meal sheet stay shared across the whole office:
-- employees tick their meals on one sheet no matter who is manager that
-- month.
--
-- Table/function names still say "admin" (admin_profiles, is_admin) to avoid
-- churn; an admin_profiles row now means "is a mess manager".

-- ---------------------------------------------------------------------------
-- Mess periods
-- ---------------------------------------------------------------------------

create table if not exists public.mess_periods (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null default auth.uid()
    references public.admin_profiles (id) on delete cascade,
  start_date date not null,
  -- Exclusive: a 5 Jan period has end_date 5 Feb, which is also the next
  -- period's start_date.
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint mess_periods_valid_range check (end_date > start_date),
  -- One manager per day: two periods may touch but never overlap. Enforced
  -- by the database, so it holds even though managers can't see each
  -- other's periods.
  constraint mess_periods_no_overlap
    exclude using gist ((daterange(start_date, end_date)) with &&)
);

create index if not exists idx_mess_periods_manager_id on public.mess_periods (manager_id);

alter table public.mess_periods enable row level security;

-- Nothing public-facing needs periods.
revoke all on public.mess_periods from anon;

drop policy if exists mess_periods_owner_select on public.mess_periods;
create policy mess_periods_owner_select
  on public.mess_periods for select
  to authenticated
  using (manager_id = auth.uid());

drop policy if exists mess_periods_owner_insert on public.mess_periods;
create policy mess_periods_owner_insert
  on public.mess_periods for insert
  to authenticated
  with check (manager_id = auth.uid() and private.is_admin());

drop policy if exists mess_periods_owner_delete on public.mess_periods;
create policy mess_periods_owner_delete
  on public.mess_periods for delete
  to authenticated
  using (manager_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Open signup: any signed-in user may create their own manager profile.
-- ---------------------------------------------------------------------------

drop policy if exists admin_profiles_self_insert on public.admin_profiles;
create policy admin_profiles_self_insert
  on public.admin_profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'admin');

drop function if exists public.claim_first_admin(text);
drop function if exists private.claim_first_admin(text);
drop function if exists public.admin_setup_completed();
drop function if exists private.admin_exists();

-- Profile + first period in one transaction, so a clash on the chosen month
-- doesn't leave a half-registered manager behind. SECURITY INVOKER: both
-- inserts go through the RLS policies above.
create or replace function public.register_mess_manager(
  p_full_name text,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_period_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to register as a mess manager';
  end if;

  insert into public.admin_profiles (id, full_name)
  values (auth.uid(), nullif(trim(coalesce(p_full_name, '')), ''))
  on conflict (id) do nothing;

  insert into public.mess_periods (manager_id, start_date, end_date)
  values (auth.uid(), p_start_date, p_end_date)
  returning id into v_period_id;

  return v_period_id;
end;
$$;

revoke all on function public.register_mess_manager(text, date, date) from public;
revoke execute on function public.register_mess_manager(text, date, date) from anon;
grant execute on function public.register_mess_manager(text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Prices belong to a period
-- ---------------------------------------------------------------------------

-- Rows from before this migration have no period and become invisible to
-- everyone; each manager sets prices for their own period.
alter table public.meal_prices
  add column if not exists period_id uuid references public.mess_periods (id) on delete cascade;

create index if not exists idx_meal_prices_period_id on public.meal_prices (period_id);

drop policy if exists meal_prices_admin_select on public.meal_prices;
drop policy if exists meal_prices_admin_insert on public.meal_prices;
drop policy if exists meal_prices_admin_update on public.meal_prices;
drop policy if exists meal_prices_admin_delete on public.meal_prices;

drop policy if exists meal_prices_owner_select on public.meal_prices;
create policy meal_prices_owner_select
  on public.meal_prices for select
  to authenticated
  using (
    exists (
      select 1 from public.mess_periods p
      where p.id = meal_prices.period_id and p.manager_id = auth.uid()
    )
  );

-- A price must fall inside the period it belongs to.
drop policy if exists meal_prices_owner_insert on public.meal_prices;
create policy meal_prices_owner_insert
  on public.meal_prices for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = meal_prices.period_id
        and p.manager_id = auth.uid()
        and meal_prices.effective_from >= p.start_date
        and meal_prices.effective_from < p.end_date
    )
  );

drop policy if exists meal_prices_owner_delete on public.meal_prices;
create policy meal_prices_owner_delete
  on public.meal_prices for delete
  to authenticated
  using (
    exists (
      select 1 from public.mess_periods p
      where p.id = meal_prices.period_id and p.manager_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- A manager may only hard-delete meal records inside their own periods.
-- ---------------------------------------------------------------------------

drop policy if exists meal_records_admin_delete on public.meal_records;
create policy meal_records_admin_delete
  on public.meal_records for delete
  to authenticated
  using (
    exists (
      select 1 from public.mess_periods p
      where p.manager_id = auth.uid()
        and meal_records.meal_date >= p.start_date
        and meal_records.meal_date < p.end_date
    )
  );

-- ---------------------------------------------------------------------------
-- Per-period report (replaces get_monthly_report)
-- ---------------------------------------------------------------------------

drop function if exists public.get_monthly_report(int, int);

-- SECURITY INVOKER: the period lookup goes through mess_periods RLS, so a
-- caller who doesn't own p_period_id gets zero rows, not someone else's
-- totals. Each meal is priced with the period's price in effect that day.
create or replace function public.get_period_report(p_period_id uuid)
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
  with period as (
    select id, start_date, end_date from public.mess_periods where id = p_period_id
  ),
  priced as (
    select
      mr.employee_id,
      mr.breakfast,
      mr.lunch,
      mr.dinner,
      price.breakfast_price,
      price.lunch_price,
      price.dinner_price
    from public.meal_records mr
    join period on mr.meal_date >= period.start_date and mr.meal_date < period.end_date
    left join lateral (
      select mp.breakfast_price, mp.lunch_price, mp.dinner_price
      from public.meal_prices mp
      where mp.period_id = period.id and mp.effective_from <= mr.meal_date
      order by mp.effective_from desc, mp.created_at desc
      limit 1
    ) price on true
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
  where exists (select 1 from period)
  group by e.id, e.name, e.is_active
  order by e.name;
$$;

revoke all on function public.get_period_report(uuid) from public;
revoke execute on function public.get_period_report(uuid) from anon;
grant execute on function public.get_period_report(uuid) to authenticated;
