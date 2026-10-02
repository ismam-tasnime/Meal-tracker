-- Eggs: an extra charge per employee, kept completely apart from meals.
--
-- The mess manager records, for one date, how many eggs an employee ate
-- (Mess Manager Panel -> Meal Status, beside that employee's breakfast /
-- lunch / dinner), at a price per egg they set for the month:
--
--   egg total for a date = egg quantity × price per egg
--   egg cost for a month = the same, over every date of the mess month
--
-- EGGS ARE NOT MEALS. They live in their own table and are never part of
-- meal_records, so they can't change anyone's breakfast / lunch / dinner
-- status, their meal count, the meal rate, or any meal deadline. The meal
-- arithmetic in get_period_report() / get_my_statement() is untouched —
-- eggs are added on top:
--
--   meal bill  = meal count × meal rate      (exactly as before)
--   egg bill   = Σ egg quantity × egg price
--   final bill = meal bill + egg bill
--   balance    = total deposit − final bill
--
-- WHEN AN EGG CHARGE REACHES A BILL. meal bill is null until the rate is
-- set (the manager's own pages) or published (the employee's panel), and
-- so final bill is null too: an egg charge is recorded and shown on its
-- own, but never added to a finalised bill before the rate is there. Once
-- the rate is published, the employee's bill is meal cost + egg cost.
--
-- EACH MONTH KEEPS ITS OWN EGGS. Every egg record belongs to one mess
-- period, like meal counts, deposits, guests and spending (0006, 0014),
-- and only to a date that period has meals on. October's eggs can never
-- appear in a November bill.
--
-- THE PRICE IS KEPT PER RECORD. mess_periods.egg_price is the price the
-- manager is using now; each egg record stores the price it was saved
-- with, so changing the month's price never silently re-prices eggs
-- already recorded.
--
-- Additive: one new column, one new table, one new function, and new
-- versions of the two bill functions that add the egg columns.

-- ---------------------------------------------------------------------------
-- 1. The month's price per egg
-- ---------------------------------------------------------------------------

alter table public.mess_periods
  add column if not exists egg_price numeric(10, 2);

alter table public.mess_periods
  drop constraint if exists mess_periods_egg_price_check;
alter table public.mess_periods
  add constraint mess_periods_egg_price_check
    check (egg_price is null or (egg_price >= 0 and egg_price <= 10000));

comment on column public.mess_periods.egg_price is
  'Price per egg (BDT) the mess manager is using for this month. Null until '
  'they set one; each egg_records row keeps the price it was saved with.';

-- The owning team may change it — and still nothing else about the period
-- (the 0006 owner-update policy limits it to their own month).
grant update (egg_price) on public.mess_periods to authenticated;

-- ---------------------------------------------------------------------------
-- 2. egg_records: one row per employee per date
-- ---------------------------------------------------------------------------

-- (period_id, employee_id, meal_date) is unique, so recording eggs for an
-- employee on a date again overwrites that one row — an edit can never
-- charge twice. No row means no eggs, which is also what 0 eggs saves as
-- (the app deletes the row), so a quantity is always a real quantity.
-- egg_total is computed by the database from the two columns beside it, so
-- a stored total can never disagree with them.
create table if not exists public.egg_records (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.mess_periods (id) on delete restrict,
  -- RESTRICT: an employee with egg charges can't be hard-deleted
  -- (deactivate instead), like deposits (0006).
  employee_id uuid not null references public.employees (id) on delete restrict,
  meal_date date not null,
  egg_qty integer not null check (egg_qty > 0 and egg_qty <= 100),
  egg_price numeric(10, 2) not null check (egg_price >= 0 and egg_price <= 10000),
  egg_total numeric(12, 2) not null generated always as (round(egg_qty * egg_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint egg_records_period_employee_date_key unique (period_id, employee_id, meal_date)
);

create index if not exists idx_egg_records_period_date on public.egg_records (period_id, meal_date);
create index if not exists idx_egg_records_employee_id on public.egg_records (employee_id);

drop trigger if exists trg_egg_records_updated_at on public.egg_records;
create trigger trg_egg_records_updated_at
  before update on public.egg_records
  for each row execute function public.set_updated_at();

alter table public.egg_records enable row level security;

-- Signed-out visitors get nothing: the cook's public meal board shows
-- meals, never money. TRUNCATE ignores RLS, so nobody gets it.
revoke all on public.egg_records from anon;
revoke truncate on public.egg_records from authenticated;

-- Read: the month's manager, or the employee the record is about (their own
-- egg history in the Employee Panel). Nobody else, and no employee can ever
-- read another employee's.
drop policy if exists egg_records_select on public.egg_records;
create policy egg_records_select
  on public.egg_records for select
  to authenticated
  using (
    employee_id = (select private.my_employee_id())
    or period_id in (select id from public.mess_periods where manager_id = (select auth.uid()))
  );

-- Write: the month's manager only, and only for dates their month has
-- meals on (the same bounds meal counts, guests and spending use, 0015).
-- Employees have no insert / update / delete policy at all, so the database
-- refuses an employee who tries to change a quantity, a price or a total.
drop policy if exists egg_records_owner_insert on public.egg_records;
create policy egg_records_owner_insert
  on public.egg_records for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = egg_records.period_id
        and p.manager_id = (select auth.uid())
        and egg_records.meal_date >= p.start_date
        and egg_records.meal_date <= p.end_date
    )
  );

drop policy if exists egg_records_owner_update on public.egg_records;
create policy egg_records_owner_update
  on public.egg_records for update
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())))
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = egg_records.period_id
        and p.manager_id = (select auth.uid())
        and egg_records.meal_date >= p.start_date
        and egg_records.meal_date <= p.end_date
    )
  );

drop policy if exists egg_records_owner_delete on public.egg_records;
create policy egg_records_owner_delete
  on public.egg_records for delete
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

-- period_id / employee_id / meal_date identify the row; only the quantity
-- and the price are ever updated, so an edit can't move a charge to another
-- employee, month or date.
create or replace function public.lock_egg_record_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.period_id <> old.period_id
     or new.employee_id <> old.employee_id
     or new.meal_date <> old.meal_date then
    raise exception 'EGG_RECORD_IDENTITY: period, employee and date cannot be changed on an egg record'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_egg_record_identity() from public, anon, authenticated;

drop trigger if exists trg_egg_records_lock_identity on public.egg_records;
create trigger trg_egg_records_lock_identity
  before update on public.egg_records
  for each row execute function public.lock_egg_record_identity();

-- ---------------------------------------------------------------------------
-- 3. The manager's report: the meal bill, the egg bill, the final bill
-- ---------------------------------------------------------------------------

-- Every meal number below is exactly as in 0015 — same meals, same weights,
-- same total_bill. What is new: egg_count, egg_total, final_bill
-- (total_bill + egg_total) and a balance measured against the final bill,
-- so "Amount to be Paid" includes eggs. An employee who only has eggs this
-- month is listed too.
-- The return type changes, so the old version has to be dropped first.
drop function if exists public.get_period_report(uuid);

create function public.get_period_report(p_period_id uuid)
returns table (
  employee_id uuid,
  token_no integer,
  employee_name text,
  is_active boolean,
  breakfast_count bigint,
  lunch_count bigint,
  dinner_count bigint,
  meal_count numeric,
  total_bill numeric,
  egg_count bigint,
  egg_total numeric,
  final_bill numeric,
  total_deposit numeric,
  balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with period as (
    select id, start_date, end_date, first_slot, last_slot, meal_rate
    from public.mess_periods
    where id = p_period_id
  ),
  owned as (
    select
      mr.employee_id,
      mr.meal_date,
      mr.breakfast and private.meal_slot(mr.meal_date, 'breakfast') between period.first_slot and period.last_slot as breakfast,
      mr.lunch and private.meal_slot(mr.meal_date, 'lunch') between period.first_slot and period.last_slot as lunch,
      mr.dinner and private.meal_slot(mr.meal_date, 'dinner') between period.first_slot and period.last_slot as dinner,
      period.id as period_id
    from public.meal_records mr
    join period on mr.meal_date between period.start_date and period.end_date
  ),
  meals as (
    select
      o.employee_id,
      count(*) filter (where o.breakfast) as breakfast_count,
      count(*) filter (where o.lunch) as lunch_count,
      count(*) filter (where o.dinner) as dinner_count,
      sum(
        (case when o.breakfast then coalesce(w.breakfast_weight, 0.75) else 0 end)
        + (case when o.lunch then coalesce(w.lunch_weight, 1.25) else 0 end)
        + (case when o.dinner then coalesce(w.dinner_weight, 1.00) else 0 end)
      ) as meal_count
    from owned o
    left join public.meal_day_weights w
      on w.period_id = o.period_id and w.meal_date = o.meal_date
    group by o.employee_id
  ),
  eggs as (
    select er.employee_id,
           sum(er.egg_qty)::bigint as egg_count,
           sum(er.egg_total) as egg_total
    from public.egg_records er
    join period on er.period_id = period.id
    group by er.employee_id
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
      e.token_no,
      e.name as employee_name,
      e.is_active,
      coalesce(meals.breakfast_count, 0) as breakfast_count,
      coalesce(meals.lunch_count, 0) as lunch_count,
      coalesce(meals.dinner_count, 0) as dinner_count,
      coalesce(meals.meal_count, 0) as meal_count,
      round(coalesce(meals.meal_count, 0) * period.meal_rate, 2) as total_bill,
      coalesce(eggs.egg_count, 0) as egg_count,
      coalesce(eggs.egg_total, 0) as egg_total,
      coalesce(paid.total_deposit, 0) as total_deposit
    from public.employees e
    cross join period
    left join meals on meals.employee_id = e.id
    left join eggs on eggs.employee_id = e.id
    left join paid on paid.employee_id = e.id
    where e.is_active
       or meals.employee_id is not null
       or eggs.employee_id is not null
       or paid.employee_id is not null
  )
  select
    employee_id, token_no, employee_name, is_active,
    breakfast_count, lunch_count, dinner_count,
    meal_count,
    total_bill,                                    -- null until the meal rate is set
    egg_count,
    egg_total,                                     -- always known, rate or no rate
    round(total_bill + egg_total, 2) as final_bill, -- null until the meal rate is set
    total_deposit,
    round(total_deposit - (total_bill + egg_total), 2) as balance
  from summary
  order by token_no nulls last, employee_name;
$$;

revoke all on function public.get_period_report(uuid) from public;
revoke execute on function public.get_period_report(uuid) from anon;
grant execute on function public.get_period_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The employee's own bill, with their eggs
-- ---------------------------------------------------------------------------

-- Same meals, same meal count, same published-rate-only total_bill as
-- 0015/0013. New: egg_count, egg_total and final_bill, and the balance is
-- against the final bill. Eggs belong to the month's period, so a month
-- nobody manages has no eggs to show.
-- The return type changes, so the old version has to be dropped first.
drop function if exists public.get_my_statement(date);

create function public.get_my_statement(p_start date)
returns table (
  period_exists boolean,
  meal_rate numeric,
  rate_published_at timestamptz,
  breakfast_count bigint,
  lunch_count bigint,
  dinner_count bigint,
  meal_count numeric,
  total_bill numeric,
  egg_count bigint,
  egg_total numeric,
  final_bill numeric,
  total_deposit numeric,
  balance numeric,
  deposits jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select private.my_employee_id() as employee_id
  ),
  period as (
    select p.id, p.published_meal_rate as meal_rate, p.rate_published_at
      from public.mess_periods p
     where p.start_date = p_start
  ),
  bounds as (
    select
      coalesce(p.start_date, p_start) as start_date,
      coalesce(p.end_date, (p_start + interval '1 month')::date) as end_date,
      coalesce(p.first_slot, private.meal_slot(p_start, 'lunch')) as first_slot,
      coalesce(p.last_slot, private.meal_slot((p_start + interval '1 month')::date, 'breakfast')) as last_slot
    from (select 1) one
    left join public.mess_periods p on p.start_date = p_start
  ),
  owned as (
    select
      mr.meal_date,
      mr.breakfast and private.meal_slot(mr.meal_date, 'breakfast') between b.first_slot and b.last_slot as breakfast,
      mr.lunch and private.meal_slot(mr.meal_date, 'lunch') between b.first_slot and b.last_slot as lunch,
      mr.dinner and private.meal_slot(mr.meal_date, 'dinner') between b.first_slot and b.last_slot as dinner
    from public.meal_records mr
    cross join bounds b
    join me on mr.employee_id = me.employee_id
    where mr.meal_date between b.start_date and b.end_date
  ),
  meals as (
    select
      count(*) filter (where o.breakfast) as breakfast_count,
      count(*) filter (where o.lunch) as lunch_count,
      count(*) filter (where o.dinner) as dinner_count,
      coalesce(sum(
        (case when o.breakfast then coalesce(w.breakfast_weight, 0.75) else 0 end)
        + (case when o.lunch then coalesce(w.lunch_weight, 1.25) else 0 end)
        + (case when o.dinner then coalesce(w.dinner_weight, 1.00) else 0 end)
      ), 0) as meal_count
    from owned o
    left join period on true
    left join public.meal_day_weights w
      on w.period_id = period.id and w.meal_date = o.meal_date
  ),
  eggs as (
    select
      coalesce(sum(er.egg_qty), 0)::bigint as egg_count,
      coalesce(sum(er.egg_total), 0) as egg_total
    from period
    join me on true
    join public.egg_records er
      on er.period_id = period.id and er.employee_id = me.employee_id
  ),
  paid as (
    select
      coalesce(sum(d.amount), 0) as total_deposit,
      coalesce(
        jsonb_agg(
          jsonb_build_object('amount', d.amount, 'deposited_on', d.deposited_on, 'note', d.note)
          order by d.deposited_on desc, d.created_at desc
        ) filter (where d.id is not null),
        '[]'::jsonb
      ) as deposits
    from period
    join me on true
    join public.deposits d on d.period_id = period.id and d.employee_id = me.employee_id
  ),
  summary as (
    select
      exists (select 1 from period) as period_exists,
      (select meal_rate from period) as meal_rate,
      (select rate_published_at from period) as rate_published_at,
      meals.breakfast_count,
      meals.lunch_count,
      meals.dinner_count,
      meals.meal_count,
      round(meals.meal_count * (select meal_rate from period), 2) as total_bill,
      coalesce((select egg_count from eggs), 0) as egg_count,
      coalesce((select egg_total from eggs), 0) as egg_total,
      coalesce((select total_deposit from paid), 0) as total_deposit,
      coalesce((select deposits from paid), '[]'::jsonb) as deposits
    from meals
  )
  select
    period_exists, meal_rate, rate_published_at,
    breakfast_count, lunch_count, dinner_count, meal_count,
    total_bill,                                     -- null until the rate is published
    egg_count,
    egg_total,                                      -- shown with or without a rate
    round(total_bill + egg_total, 2) as final_bill, -- null until the rate is published
    total_deposit,
    round(total_deposit - (total_bill + egg_total), 2) as balance,
    deposits
  from summary
  where (select employee_id from me) is not null
    and extract(day from p_start) = 5;
$$;

revoke all on function public.get_my_statement(date) from public;
revoke all on function public.get_my_statement(date) from anon;
grant execute on function public.get_my_statement(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The employee's own egg history, date by date
-- ---------------------------------------------------------------------------

-- Read-only, and only ever the caller's own eggs, for the mess month
-- starting on p_start. SECURITY DEFINER for the same reason as
-- get_my_statement: it answers for the caller's employee and nobody else.
create or replace function public.get_my_egg_days(p_start date)
returns table (
  meal_date date,
  egg_qty integer,
  egg_price numeric,
  egg_total numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select private.my_employee_id() as employee_id
  ),
  period as (
    select p.id from public.mess_periods p where p.start_date = p_start
  )
  select er.meal_date, er.egg_qty, er.egg_price, er.egg_total
    from public.egg_records er
    join period on er.period_id = period.id
    join me on er.employee_id = me.employee_id
   where (select employee_id from me) is not null
     and extract(day from p_start) = 5
   order by er.meal_date;
$$;

revoke all on function public.get_my_egg_days(date) from public;
revoke all on function public.get_my_egg_days(date) from anon;
grant execute on function public.get_my_egg_days(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The dashboard: the month's egg charges beside its meal bill
-- ---------------------------------------------------------------------------

-- Every number is as in 0015 — same employees, same meal count, same
-- deposits, and total_bill is still the MEAL bill only. What is new is
-- egg_total, so the Dashboard can show the egg charges and the full bill
-- (meal + egg) the same way the Expense Status and Report tables do.
-- total_due was already the full picture: it adds up the report's balances,
-- which bill eggs from section 3 onwards.
-- The return type changes, so the old version has to be dropped first.
drop function if exists public.get_dashboard_stats(uuid, date);

create function public.get_dashboard_stats(p_period_id uuid, p_today date)
returns table (
  active_employees bigint,
  today_in_period boolean,
  today_breakfast bigint,
  today_lunch bigint,
  today_dinner bigint,
  meal_count numeric,
  total_deposit numeric,
  total_bill numeric,
  egg_total numeric,
  total_due numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with period as (
    select id, start_date, end_date, first_slot, last_slot, meal_rate
    from public.mess_periods
    where id = p_period_id
  ),
  report as (
    select * from public.get_period_report(p_period_id)
  ),
  today as (
    select
      count(*) filter (where breakfast) as breakfast,
      count(*) filter (where lunch) as lunch,
      count(*) filter (where dinner) as dinner
    from public.meal_records
    where meal_date = p_today
  )
  select
    (select count(*) from public.employees where is_active),
    p_today between period.start_date and period.end_date,
    case when private.meal_slot(p_today, 'breakfast') between period.first_slot and period.last_slot
         then today.breakfast end,
    case when private.meal_slot(p_today, 'lunch') between period.first_slot and period.last_slot
         then today.lunch end,
    case when private.meal_slot(p_today, 'dinner') between period.first_slot and period.last_slot
         then today.dinner end,
    coalesce((select sum(meal_count) from report), 0),
    coalesce((select sum(total_deposit) from report), 0),
    case when period.meal_rate is null then null
         else coalesce((select sum(total_bill) from report), 0) end,
    coalesce((select sum(egg_total) from report), 0),  -- known with or without a rate
    case when period.meal_rate is null then null
         else coalesce((select sum(-balance) from report where balance < 0), 0) end
  from period cross join today;
$$;

revoke all on function public.get_dashboard_stats(uuid, date) from public;
revoke execute on function public.get_dashboard_stats(uuid, date) from anon;
grant execute on function public.get_dashboard_stats(uuid, date) to authenticated;
