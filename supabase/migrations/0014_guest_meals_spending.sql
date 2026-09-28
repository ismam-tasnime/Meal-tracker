-- Guest meals and daily spending, both kept by the mess manager.
--
-- Guest meals (Mess Manager Panel -> Guest): guests who eat at the office
-- are paid for by the office, not by employees, at a fixed price per guest:
--
--   Breakfast 60 BDT · Lunch 150 BDT · Dinner 150 BDT
--   (GUEST_MEAL_RATES in src/lib/utils/guests.ts)
--
--   guest bill for a date = breakfast guests × 60 + lunch guests × 150
--                           + dinner guests × 150
--   total bill to collect = the same, over every date of the mess month
--
-- Only the guest counts are stored. Bills are always worked out from them,
-- so changing a count can never leave a stale total behind. Guests are kept
-- apart from the employees' meal_records and never change anyone's meal
-- count or bill.
--
-- Spending (Mess Manager Panel -> Spend): what the mess spent, one row per
-- payment, so a date can have any number of rows. The month's total is
-- added up from the rows when asked (get_spending_total), never stored.
--
-- Both belong to one mess period, like meal_day_weights and deposits (0006):
-- only that month's manager account can read or change them, and only for
-- dates inside that month, enforced by RLS. Employees and signed-out
-- visitors can't read either table. The one exception is the cook's
-- read-only meal board (the public landing page): get_today_guest_meals()
-- hands it today's three guest counts and nothing else.
--
-- Additive only: two new tables and two new functions. No existing table,
-- policy, function, or row is changed.

-- ---------------------------------------------------------------------------
-- Guest meals: one row per date
-- ---------------------------------------------------------------------------

-- The date is the primary key and each meal is a column, so a date + meal
-- can only ever have one guest count: saving again overwrites it. A missing
-- row means no guests that day; the app deletes the row rather than storing
-- three zeros (like meal_menus in 0012).
create table if not exists public.guest_meals (
  meal_date date primary key,
  period_id uuid not null references public.mess_periods (id) on delete cascade,
  breakfast_guests integer not null default 0 check (breakfast_guests between 0 and 10000),
  lunch_guests integer not null default 0 check (lunch_guests between 0 and 10000),
  dinner_guests integer not null default 0 check (dinner_guests between 0 and 10000),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guest_meals_period_date on public.guest_meals (period_id, meal_date);

drop trigger if exists trg_guest_meals_updated_at on public.guest_meals;
create trigger trg_guest_meals_updated_at
  before update on public.guest_meals
  for each row execute function public.set_updated_at();

alter table public.guest_meals enable row level security;

-- Signed-out visitors get nothing (the cook's board goes through
-- get_today_guest_meals below). TRUNCATE ignores RLS, so nobody gets it.
revoke all on public.guest_meals from anon;
revoke truncate on public.guest_meals from authenticated;

-- Same rules as meal_day_weights (0008): the owning month's account only,
-- and only dates inside that month.
drop policy if exists guest_meals_owner_select on public.guest_meals;
create policy guest_meals_owner_select
  on public.guest_meals for select
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

drop policy if exists guest_meals_owner_insert on public.guest_meals;
create policy guest_meals_owner_insert
  on public.guest_meals for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = guest_meals.period_id
        and p.manager_id = (select auth.uid())
        and guest_meals.meal_date >= p.start_date
        and guest_meals.meal_date < p.end_date
    )
  );

drop policy if exists guest_meals_owner_update on public.guest_meals;
create policy guest_meals_owner_update
  on public.guest_meals for update
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())))
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = guest_meals.period_id
        and p.manager_id = (select auth.uid())
        and guest_meals.meal_date >= p.start_date
        and guest_meals.meal_date < p.end_date
    )
  );

drop policy if exists guest_meals_owner_delete on public.guest_meals;
create policy guest_meals_owner_delete
  on public.guest_meals for delete
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- The cook's board: today's guest counts, nothing more
-- ---------------------------------------------------------------------------

-- The meal board (/) is public and read-only, but guest_meals is the
-- month's billing data. This gives the board exactly what it shows: today's
-- three counts, "today" being Bangladesh time (Asia/Dhaka). No other date,
-- no period, no bill. SECURITY DEFINER because the board reads as anon,
-- which can't read guest_meals.
create or replace function public.get_today_guest_meals()
returns table (
  meal_date date,
  breakfast_guests integer,
  lunch_guests integer,
  dinner_guests integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.meal_date, g.breakfast_guests, g.lunch_guests, g.dinner_guests
    from public.guest_meals g
   where g.meal_date = (now() at time zone 'Asia/Dhaka')::date;
$$;

revoke all on function public.get_today_guest_meals() from public;
grant execute on function public.get_today_guest_meals() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spending: one row per payment, any number per date
-- ---------------------------------------------------------------------------

create table if not exists public.spending_records (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.mess_periods (id) on delete cascade,
  spent_on date not null,
  -- Who spent it, e.g. "Rahim". Free text: not always someone on the
  -- employee list.
  person_name text not null check (btrim(person_name) <> '' and char_length(person_name) <= 80),
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spending_records_period_date
  on public.spending_records (period_id, spent_on);

drop trigger if exists trg_spending_records_updated_at on public.spending_records;
create trigger trg_spending_records_updated_at
  before update on public.spending_records
  for each row execute function public.set_updated_at();

alter table public.spending_records enable row level security;

-- Managers write the date, name and amount; the id and timestamps are the
-- database's, and an entry can't be moved to another month.
revoke all on public.spending_records from anon;
revoke insert, update, truncate on public.spending_records from authenticated;
grant insert (period_id, spent_on, person_name, amount),
      update (spent_on, person_name, amount)
  on public.spending_records to authenticated;

drop policy if exists spending_records_owner_select on public.spending_records;
create policy spending_records_owner_select
  on public.spending_records for select
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

-- The date must fall inside the owning month, so months never mix.
drop policy if exists spending_records_owner_insert on public.spending_records;
create policy spending_records_owner_insert
  on public.spending_records for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = spending_records.period_id
        and p.manager_id = (select auth.uid())
        and spending_records.spent_on >= p.start_date
        and spending_records.spent_on < p.end_date
    )
  );

drop policy if exists spending_records_owner_update on public.spending_records;
create policy spending_records_owner_update
  on public.spending_records for update
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())))
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = spending_records.period_id
        and p.manager_id = (select auth.uid())
        and spending_records.spent_on >= p.start_date
        and spending_records.spent_on < p.end_date
    )
  );

drop policy if exists spending_records_owner_delete on public.spending_records;
create policy spending_records_owner_delete
  on public.spending_records for delete
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

-- "Sum Spending": the month's total, added up from its rows when asked.
-- SECURITY INVOKER: the rows go through RLS, so a period the caller doesn't
-- own adds up to zero.
create or replace function public.get_spending_total(p_period_id uuid)
returns table (entry_count bigint, total_amount numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*), coalesce(sum(s.amount), 0)
    from public.spending_records s
   where s.period_id = p_period_id;
$$;

revoke all on function public.get_spending_total(uuid) from public;
revoke execute on function public.get_spending_total(uuid) from anon;
grant execute on function public.get_spending_total(uuid) to authenticated;
