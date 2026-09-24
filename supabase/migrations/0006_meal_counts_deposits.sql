-- Meal counts (weights), deposits, and a month-end meal rate.
--
-- The mess doesn't price each meal. Instead every meal on every date has a
-- *meal count* (weight), e.g. breakfast 0.75, lunch 1.25, dinner 1.00, which
-- the mess manager may change for a given date. At month end the manager
-- sets one meal rate, and:
--
--   employee meal count = Σ over days of (breakfast ON × breakfast weight
--                                         + lunch ON × lunch weight
--                                         + dinner ON × dinner weight)
--   total bill          = meal count × meal rate
--   balance             = total deposit − total bill
--                         (> 0 remaining/refund, = 0 settled, < 0 due)
--
-- Weights are stored once per date (not per employee) and joined at report
-- time, so changing a date's lunch weight instantly re-prices everyone who
-- had lunch that day.
--
-- Every new table belongs to one mess period and is readable/writable only
-- by that period's account (the monthly team login), enforced by RLS.
-- Replaces the per-meal price model (meal_prices), which was never used
-- for a mess month.

-- ---------------------------------------------------------------------------
-- Helper: does the caller own this period?
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so RLS policies can call it without recursing through
-- mess_periods' own policy. Only ever answers for auth.uid().
create or replace function private.owns_period(p_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mess_periods
    where id = p_period_id and manager_id = auth.uid()
  );
$$;

revoke all on function private.owns_period(uuid) from public;
revoke all on function private.owns_period(uuid) from anon;
grant execute on function private.owns_period(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Month-end meal rate
-- ---------------------------------------------------------------------------

alter table public.mess_periods
  add column if not exists meal_rate numeric(10, 2) check (meal_rate is null or meal_rate >= 0);

-- The owning team may change the rate — and nothing else about the period.
grant update (meal_rate) on public.mess_periods to authenticated;

drop policy if exists mess_periods_owner_update on public.mess_periods;
create policy mess_periods_owner_update
  on public.mess_periods for update
  to authenticated
  using (manager_id = auth.uid())
  with check (manager_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Per-date meal counts (weights)
-- ---------------------------------------------------------------------------

-- A missing row means "defaults": 0.75 / 1.25 / 1.00. See
-- private.default_weight() and DEFAULT_MEAL_WEIGHTS in src/lib/utils/mess.ts.
create table if not exists public.meal_day_weights (
  period_id uuid not null references public.mess_periods (id) on delete cascade,
  meal_date date not null,
  breakfast_weight numeric(5, 2) not null default 0.75 check (breakfast_weight between 0 and 10),
  lunch_weight numeric(5, 2) not null default 1.25 check (lunch_weight between 0 and 10),
  dinner_weight numeric(5, 2) not null default 1.00 check (dinner_weight between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (period_id, meal_date)
);

drop trigger if exists trg_meal_day_weights_updated_at on public.meal_day_weights;
create trigger trg_meal_day_weights_updated_at
  before update on public.meal_day_weights
  for each row execute function public.set_updated_at();

alter table public.meal_day_weights enable row level security;
revoke all on public.meal_day_weights from anon;

-- The date must fall inside the owning period.
create or replace function private.date_in_period(p_period_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mess_periods
    where id = p_period_id
      and manager_id = auth.uid()
      and p_date >= start_date and p_date < end_date
  );
$$;

revoke all on function private.date_in_period(uuid, date) from public;
revoke all on function private.date_in_period(uuid, date) from anon;
grant execute on function private.date_in_period(uuid, date) to authenticated;

drop policy if exists meal_day_weights_owner_select on public.meal_day_weights;
create policy meal_day_weights_owner_select
  on public.meal_day_weights for select
  to authenticated
  using (private.owns_period(period_id));

drop policy if exists meal_day_weights_owner_insert on public.meal_day_weights;
create policy meal_day_weights_owner_insert
  on public.meal_day_weights for insert
  to authenticated
  with check (private.date_in_period(period_id, meal_date));

drop policy if exists meal_day_weights_owner_update on public.meal_day_weights;
create policy meal_day_weights_owner_update
  on public.meal_day_weights for update
  to authenticated
  using (private.owns_period(period_id))
  with check (private.date_in_period(period_id, meal_date));

drop policy if exists meal_day_weights_owner_delete on public.meal_day_weights;
create policy meal_day_weights_owner_delete
  on public.meal_day_weights for delete
  to authenticated
  using (private.owns_period(period_id));

-- ---------------------------------------------------------------------------
-- Deposits
-- ---------------------------------------------------------------------------

-- Any number per employee per month (or none). The date is informational —
-- money handed over before the month starts still counts for that month.
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.mess_periods (id) on delete cascade,
  -- Restrict: an employee with deposits can't be hard-deleted (deactivate
  -- instead), so money records never silently disappear.
  employee_id uuid not null references public.employees (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  deposited_on date not null default current_date,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists idx_deposits_period_employee on public.deposits (period_id, employee_id);
create index if not exists idx_deposits_employee_id on public.deposits (employee_id);

alter table public.deposits enable row level security;
revoke all on public.deposits from anon;
revoke update on public.deposits from authenticated;

drop policy if exists deposits_owner_select on public.deposits;
create policy deposits_owner_select
  on public.deposits for select
  to authenticated
  using (private.owns_period(period_id));

drop policy if exists deposits_owner_insert on public.deposits;
create policy deposits_owner_insert
  on public.deposits for insert
  to authenticated
  with check (private.owns_period(period_id));

drop policy if exists deposits_owner_delete on public.deposits;
create policy deposits_owner_delete
  on public.deposits for delete
  to authenticated
  using (private.owns_period(period_id));

-- ---------------------------------------------------------------------------
-- Usernames are written without a space now: "January2026".
-- ---------------------------------------------------------------------------

update public.admin_profiles set full_name = replace(full_name, ' ', '') where full_name like '% %';

create or replace function private.register_mess_manager()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_match text[];
  v_year int;
  v_month int;
  v_start date;
begin
  if v_uid is null then
    raise exception 'Must be signed in to register as a mess manager';
  end if;

  -- Already registered: idempotent success.
  if exists (select 1 from public.admin_profiles where id = v_uid) then
    return true;
  end if;

  v_match := regexp_match(
    lower(coalesce(auth.jwt() ->> 'email', '')),
    '^mess-(\d{4})-(\d{2})@mess-manager\.app$'
  );
  if v_match is null then
    return false;
  end if;

  v_year := v_match[1]::int;
  v_month := v_match[2]::int;
  if v_month < 1 or v_month > 12 then
    return false;
  end if;

  v_start := make_date(v_year, v_month, 5);

  insert into public.admin_profiles (id, full_name)
  values (v_uid, to_char(make_date(v_year, v_month, 1), 'FMMonth') || v_year);

  insert into public.mess_periods (manager_id, start_date, end_date)
  values (v_uid, v_start, (v_start + interval '1 month')::date);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Final report: meal count → bill → deposit → balance
-- ---------------------------------------------------------------------------

drop function if exists public.get_period_report(uuid);

-- SECURITY INVOKER: every table read goes through RLS, so a caller who
-- doesn't own p_period_id gets zero rows. Lists every employee who is
-- active or had meals/deposits in the period, so people who joined or left
-- mid-month are billed for exactly what they ate.
create or replace function public.get_period_report(p_period_id uuid)
returns table (
  employee_id uuid,
  employee_name text,
  is_active boolean,
  breakfast_count bigint,
  lunch_count bigint,
  dinner_count bigint,
  meal_count numeric,
  total_bill numeric,
  total_deposit numeric,
  balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with period as (
    select id, start_date, end_date, meal_rate
    from public.mess_periods
    where id = p_period_id
  ),
  meals as (
    select
      mr.employee_id,
      count(*) filter (where mr.breakfast) as breakfast_count,
      count(*) filter (where mr.lunch) as lunch_count,
      count(*) filter (where mr.dinner) as dinner_count,
      sum(
        (case when mr.breakfast then coalesce(w.breakfast_weight, 0.75) else 0 end)
        + (case when mr.lunch then coalesce(w.lunch_weight, 1.25) else 0 end)
        + (case when mr.dinner then coalesce(w.dinner_weight, 1.00) else 0 end)
      ) as meal_count
    from public.meal_records mr
    join period on mr.meal_date >= period.start_date and mr.meal_date < period.end_date
    left join public.meal_day_weights w
      on w.period_id = period.id and w.meal_date = mr.meal_date
    group by mr.employee_id
  ),
  paid as (
    select d.employee_id, sum(d.amount) as total_deposit
    from public.deposits d
    join period on d.period_id = period.id
    group by d.employee_id
  ),
  summary as (
    select
      e.id as employee_id,
      e.name as employee_name,
      e.is_active,
      coalesce(meals.breakfast_count, 0) as breakfast_count,
      coalesce(meals.lunch_count, 0) as lunch_count,
      coalesce(meals.dinner_count, 0) as dinner_count,
      coalesce(meals.meal_count, 0) as meal_count,
      round(coalesce(meals.meal_count, 0) * period.meal_rate, 2) as total_bill,
      coalesce(paid.total_deposit, 0) as total_deposit
    from public.employees e
    cross join period
    left join meals on meals.employee_id = e.id
    left join paid on paid.employee_id = e.id
    where e.is_active or meals.employee_id is not null or paid.employee_id is not null
  )
  select
    employee_id, employee_name, is_active,
    breakfast_count, lunch_count, dinner_count,
    meal_count,
    total_bill,                           -- null until the meal rate is set
    total_deposit,
    total_deposit - total_bill as balance -- null until the meal rate is set
  from summary
  order by employee_name;
$$;

revoke all on function public.get_period_report(uuid) from public;
revoke execute on function public.get_period_report(uuid) from anon;
grant execute on function public.get_period_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Retire per-meal prices
-- ---------------------------------------------------------------------------

drop table if exists public.meal_prices;
