-- Manager periods at meal level, and business data that no account change
-- can delete.
--
-- THE RULE. Each mess month has one manager, and their period runs from the
-- 5th's LUNCH through the next month's 5th BREAKFAST:
--
--   September manager: 5 Sep lunch, 5 Sep dinner, 6 Sep … 4 Oct, 5 Oct breakfast
--   October manager:   5 Oct lunch, 5 Oct dinner, 6 Oct … 4 Nov, 5 Nov breakfast
--
-- A date alone doesn't say whose a meal is: 5 Oct breakfast is September's,
-- 5 Oct lunch is October's. So every meal gets a number in time order — its
-- "slot", three a day (private.meal_slot) — and a period owns the meals
-- from its first slot to its last. private.get_meal_period(date, meal) is
-- the one answer to "whose meal is this?", and everything below uses it or
-- the same slots: who may change a meal, which meals a bill counts, which
-- period a boundary day's meal counts and guests belong to.
--
-- WHAT EXPIRES. A manager may change employees' meal ON/OFF only for meals
-- their own period owns, and only while their period is open: from 00:00 on
-- its first day to 23:59 on its last day, Bangladesh time
-- (private.period_status). On the 5th both managers are open, each for
-- their own meals of that day only: the outgoing manager for breakfast, the
-- incoming one for lunch and dinner. No meal ever has two managers. This is
-- enforced by RLS and a trigger on meal_records, whatever sends the write.
--
-- WHAT DOESN'T. Nothing else about the account or the month expires: the
-- manager keeps signing in and keeps full access to their month's meals
-- (read-only), meal counts, deposits, meal rate, guests, spending, reports
-- and calculations. Employees' own meal changes and deadlines (0009) are
-- untouched.
--
-- DATA SAFETY. Deleting a manager's login used to cascade: auth user ->
-- admin profile -> mess period -> meal counts, deposits, guests, spending.
-- Every foreign key holding business history is now ON DELETE RESTRICT, so
-- such a delete fails instead of erasing anything. Nothing here deletes or
-- rewrites a row; existing periods keep their dates and get the standard
-- first/last meal (lunch / breakfast).

-- ---------------------------------------------------------------------------
-- 1. Meal slots
-- ---------------------------------------------------------------------------

-- breakfast 0, lunch 1, dinner 2; null for anything else, so an unknown meal
-- never matches a period.
create or replace function private.meal_order(p_meal text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_meal when 'breakfast' then 0 when 'lunch' then 1 when 'dinner' then 2 end;
$$;

-- Every meal as one number, in time order (3 per day). Calendar dates, so
-- month lengths and leap years need no special handling.
create or replace function private.meal_slot(p_meal_date date, p_meal text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_meal_date - date '2000-01-01') * 3 + private.meal_order(p_meal);
$$;

revoke all on function private.meal_order(text) from public, anon;
revoke all on function private.meal_slot(date, text) from public, anon;
grant execute on function private.meal_order(text) to authenticated;
grant execute on function private.meal_slot(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. mess_periods: the first and last meal, explicitly
-- ---------------------------------------------------------------------------

-- start_date / end_date keep their values. They now mean "date of the first
-- meal" and "date of the last meal"; start_meal / end_meal say which meal.
-- A 5 Sep period: start 5 Sep lunch, end 5 Oct breakfast. The defaults are
-- the standard mess month, which register_mess_manager() creates.
alter table public.mess_periods
  add column if not exists start_meal text not null default 'lunch'
    constraint mess_periods_start_meal_check check (start_meal in ('breakfast', 'lunch', 'dinner')),
  add column if not exists end_meal text not null default 'breakfast'
    constraint mess_periods_end_meal_check check (end_meal in ('breakfast', 'lunch', 'dinner'));

alter table public.mess_periods
  add column if not exists first_slot integer
    generated always as (private.meal_slot(start_date, start_meal)) stored,
  add column if not exists last_slot integer
    generated always as (private.meal_slot(end_date, end_meal)) stored;

comment on column public.mess_periods.start_date is
  'Date of the period''s first meal (start_meal on this date).';
comment on column public.mess_periods.start_meal is
  'The period''s first meal, on start_date. Standard: lunch.';
comment on column public.mess_periods.end_date is
  'Date of the period''s last meal (end_meal on this date), inclusive.';
comment on column public.mess_periods.end_meal is
  'The period''s last meal, on end_date. Standard: breakfast.';
comment on column public.mess_periods.first_slot is
  'private.meal_slot(start_date, start_meal): the first meal the period owns.';
comment on column public.mess_periods.last_slot is
  'private.meal_slot(end_date, end_meal): the last meal the period owns.';

-- No meal can belong to two periods. Replaces the date-range rule from 0005,
-- which assumed the whole 5th belonged to the new month.
alter table public.mess_periods drop constraint if exists mess_periods_meals_in_order;
alter table public.mess_periods
  add constraint mess_periods_meals_in_order check (first_slot <= last_slot);
alter table public.mess_periods drop constraint if exists mess_periods_no_overlap;
alter table public.mess_periods drop constraint if exists mess_periods_no_meal_overlap;
alter table public.mess_periods
  add constraint mess_periods_no_meal_overlap
    exclude using gist ((int4range(first_slot, last_slot, '[]')) with &&);

-- ---------------------------------------------------------------------------
-- 3. The rules, each in one place
-- ---------------------------------------------------------------------------

-- Whose meal is this? The id of the period that owns (date, meal), or null
-- when no manager has that month. The single answer everything else uses.
create or replace function private.get_meal_period(p_meal_date date, p_meal text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.mess_periods p
   where private.meal_slot(p_meal_date, p_meal) between p.first_slot and p.last_slot;
$$;

-- Is a period open for changing employee meals at p_now? 'upcoming' before
-- its first day, 'active' from 00:00 on its first day to 23:59 on its last
-- day, 'completed' after — Bangladesh time. Only meal ON/OFF changes depend
-- on this; everything else about a period stays available.
create or replace function private.period_status(
  p_start_date date,
  p_end_date date,
  p_now timestamptz default now()
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when (p_now at time zone 'Asia/Dhaka')::date < p_start_date then 'upcoming'
           when (p_now at time zone 'Asia/Dhaka')::date > p_end_date then 'completed'
           else 'active'
         end;
$$;

-- May the signed-in mess manager change this employee meal at p_now? Only
-- if their own period owns it and is open. The trigger below always passes
-- the real time; p_now exists so the rule can be tested at exact moments.
create or replace function private.manager_can_change_meal(
  p_meal_date date,
  p_meal text,
  p_now timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.mess_periods p
     where p.manager_id = auth.uid()
       and p.id = private.get_meal_period(p_meal_date, p_meal)
       and private.period_status(p.start_date, p.end_date, p_now) = 'active'
  );
$$;

-- The same, for any meal of a date: RLS works on whole meal_records rows.
create or replace function private.manager_can_change_date(p_meal_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.manager_can_change_meal(p_meal_date, 'breakfast')
      or private.manager_can_change_meal(p_meal_date, 'lunch')
      or private.manager_can_change_meal(p_meal_date, 'dinner');
$$;

revoke all on function private.get_meal_period(date, text) from public, anon;
revoke all on function private.period_status(date, date, timestamptz) from public, anon;
revoke all on function private.manager_can_change_meal(date, text, timestamptz) from public, anon;
revoke all on function private.manager_can_change_date(date) from public, anon;
grant execute on function private.get_meal_period(date, text) to authenticated;
grant execute on function private.period_status(date, date, timestamptz) to authenticated;
grant execute on function private.manager_can_change_meal(date, text, timestamptz) to authenticated;
grant execute on function private.manager_can_change_date(date) to authenticated;

-- For the Mess Manager panel: the signed-in manager's period status, and
-- for one date, which of its meals their period owns and which they may
-- change right now. Built on the functions above, so the screen shows
-- exactly what the database will allow.
create or replace function public.get_my_meal_access(p_meal_date date)
returns table (
  period_status text,
  breakfast_owned boolean,
  lunch_owned boolean,
  dinner_owned boolean,
  breakfast_can_change boolean,
  lunch_can_change boolean,
  dinner_can_change boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    private.period_status(p.start_date, p.end_date),
    coalesce(private.get_meal_period(p_meal_date, 'breakfast') = p.id, false),
    coalesce(private.get_meal_period(p_meal_date, 'lunch') = p.id, false),
    coalesce(private.get_meal_period(p_meal_date, 'dinner') = p.id, false),
    coalesce(private.manager_can_change_meal(p_meal_date, 'breakfast'), false),
    coalesce(private.manager_can_change_meal(p_meal_date, 'lunch'), false),
    coalesce(private.manager_can_change_meal(p_meal_date, 'dinner'), false)
  from public.mess_periods p
  where p.manager_id = (select auth.uid());
$$;

revoke all on function public.get_my_meal_access(date) from public, anon;
grant execute on function public.get_my_meal_access(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. meal_records: managers change only their own, open period's meals
-- ---------------------------------------------------------------------------

-- RLS, per row: an employee their own row (unchanged); a manager only rows
-- on a date where their open period owns at least one meal.
drop policy if exists meal_records_owner_insert on public.meal_records;
create policy meal_records_owner_insert
  on public.meal_records for insert
  to authenticated
  with check (
    employee_id = (select private.my_employee_id())
    or private.manager_can_change_date(meal_date)
  );

drop policy if exists meal_records_owner_update on public.meal_records;
create policy meal_records_owner_update
  on public.meal_records for update
  to authenticated
  using (
    employee_id = (select private.my_employee_id())
    or private.manager_can_change_date(meal_date)
  )
  with check (
    employee_id = (select private.my_employee_id())
    or private.manager_can_change_date(meal_date)
  );

drop policy if exists meal_records_admin_delete on public.meal_records;
drop policy if exists meal_records_manager_delete on public.meal_records;
create policy meal_records_manager_delete
  on public.meal_records for delete
  to authenticated
  using (private.manager_can_change_date(meal_date));

-- Per meal: RLS can't see which of the row's three meals a write changes,
-- so this trigger checks each changed meal (a delete turns every ON meal
-- off). Mess managers only: employees keep the deadline trigger from 0009,
-- and the SQL editor / service role (not an API role) is trusted.
create or replace function public.enforce_manager_meal_period()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meal text;
  v_old boolean;
  v_new boolean;
  v_date date;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if not private.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_date := old.meal_date;
  else
    v_date := new.meal_date;
  end if;

  foreach v_meal in array array['breakfast', 'lunch', 'dinner'] loop
    v_old := false;
    v_new := false;
    if tg_op <> 'INSERT' then
      v_old := case v_meal when 'breakfast' then old.breakfast
                           when 'lunch' then old.lunch
                           else old.dinner end;
    end if;
    if tg_op <> 'DELETE' then
      v_new := case v_meal when 'breakfast' then new.breakfast
                           when 'lunch' then new.lunch
                           else new.dinner end;
    end if;

    if v_new is distinct from v_old
       and not private.manager_can_change_meal(v_date, v_meal) then
      raise exception 'MANAGER_PERIOD: The % of % isn''t yours to change.', v_meal, v_date
        using errcode = 'P0001',
              hint = 'A manager changes only the meals of their own period (5th lunch to the next 5th breakfast), and only until the period''s last day.';
    end if;
  end loop;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enforce_manager_meal_period() from public, anon;
grant execute on function public.enforce_manager_meal_period() to authenticated;

drop trigger if exists trg_meal_records_enforce_manager_period on public.meal_records;
create trigger trg_meal_records_enforce_manager_period
  before insert or update or delete on public.meal_records
  for each row execute function public.enforce_manager_meal_period();

-- ---------------------------------------------------------------------------
-- 5. Bills count exactly the period's own meals
-- ---------------------------------------------------------------------------

-- Same result columns and arithmetic as 0007; the only change is which
-- meals count: those whose slot lies in the period, so 5 Oct breakfast is
-- September's and 5 Oct lunch October's. A boundary date's meal counts come
-- from the owning period's own row for that date.
create or replace function public.get_period_report(p_period_id uuid)
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
      coalesce(paid.total_deposit, 0) as total_deposit
    from public.employees e
    cross join period
    left join meals on meals.employee_id = e.id
    left join paid on paid.employee_id = e.id
    where e.is_active or meals.employee_id is not null or paid.employee_id is not null
  )
  select
    employee_id, token_no, employee_name, is_active,
    breakfast_count, lunch_count, dinner_count,
    meal_count,
    total_bill,                           -- null until the meal rate is set
    total_deposit,
    total_deposit - total_bill as balance -- null until the meal rate is set
  from summary
  order by token_no nulls last, employee_name;
$$;

-- The employee's own bill: same meals as the manager's report. A month
-- nobody manages yet uses the standard bounds (5th lunch -> next 5th
-- breakfast, the mess_periods column defaults). Otherwise as in 0013.
create or replace function public.get_my_statement(p_start date)
returns table (
  period_exists boolean,
  meal_rate numeric,
  rate_published_at timestamptz,
  breakfast_count bigint,
  lunch_count bigint,
  dinner_count bigint,
  meal_count numeric,
  total_bill numeric,
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
      coalesce((select total_deposit from paid), 0) as total_deposit,
      coalesce((select deposits from paid), '[]'::jsonb) as deposits
    from meals
  )
  select
    period_exists, meal_rate, rate_published_at,
    breakfast_count, lunch_count, dinner_count, meal_count,
    total_bill,                            -- null until the rate is published
    total_deposit,
    total_deposit - total_bill as balance, -- null until the rate is published
    deposits
  from summary
  where (select employee_id from me) is not null
    and extract(day from p_start) = 5;
$$;

-- The employee's own meals day by day, for the same month and meals as
-- get_my_statement: a meal outside the month (5th breakfast, next 5th lunch
-- and dinner) comes back OFF. Otherwise as in 0011.
create or replace function public.get_my_meal_days(p_start date)
returns table (
  meal_date date,
  breakfast boolean,
  lunch boolean,
  dinner boolean,
  breakfast_weight numeric,
  lunch_weight numeric,
  dinner_weight numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      p.id as period_id,
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
      mr.dinner and private.meal_slot(mr.meal_date, 'dinner') between b.first_slot and b.last_slot as dinner,
      b.period_id
    from public.meal_records mr
    cross join bounds b
    where mr.employee_id = private.my_employee_id()
      and mr.meal_date between b.start_date and b.end_date
      and extract(day from p_start) = 5
  )
  select
    o.meal_date,
    o.breakfast,
    o.lunch,
    o.dinner,
    coalesce(w.breakfast_weight, 0.75),
    coalesce(w.lunch_weight, 1.25),
    coalesce(w.dinner_weight, 1.00)
  from owned o
  left join public.meal_day_weights w
    on w.period_id = o.period_id and w.meal_date = o.meal_date
  where o.breakfast or o.lunch or o.dinner
  order by o.meal_date;
$$;

-- The dashboard: "today" is any date with one of the period's meals, and
-- each of today's counts is only given for a meal the period owns (null for
-- the other month's meals on the 5th). Otherwise as in 0008.
create or replace function public.get_dashboard_stats(p_period_id uuid, p_today date)
returns table (
  active_employees bigint,
  today_in_period boolean,
  today_breakfast bigint,
  today_lunch bigint,
  today_dinner bigint,
  meal_count numeric,
  total_deposit numeric,
  total_bill numeric,
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
    case when period.meal_rate is null then null
         else coalesce((select sum(-balance) from report where balance < 0), 0) end
  from period cross join today;
$$;

-- ---------------------------------------------------------------------------
-- 6. Boundary days for meal counts, guests and spending
-- ---------------------------------------------------------------------------

-- A period now touches its end_date too (for that day's breakfast), so its
-- own rows may be dated up to and including end_date. On the 5th, each
-- period keeps its own row: the outgoing one's counts that day's breakfast,
-- the incoming one's lunch and dinner.
drop policy if exists meal_day_weights_owner_insert on public.meal_day_weights;
create policy meal_day_weights_owner_insert
  on public.meal_day_weights for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = meal_day_weights.period_id
        and p.manager_id = (select auth.uid())
        and meal_day_weights.meal_date >= p.start_date
        and meal_day_weights.meal_date <= p.end_date
    )
  );

drop policy if exists meal_day_weights_owner_update on public.meal_day_weights;
create policy meal_day_weights_owner_update
  on public.meal_day_weights for update
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())))
  with check (
    exists (
      select 1 from public.mess_periods p
      where p.id = meal_day_weights.period_id
        and p.manager_id = (select auth.uid())
        and meal_day_weights.meal_date >= p.start_date
        and meal_day_weights.meal_date <= p.end_date
    )
  );

-- Guests: one row per period and date (was per date), so both managers can
-- declare the 5th's guests for their own meals. A trigger keeps each row to
-- the meals its period owns, which still leaves exactly one guest count per
-- date + meal.
alter table public.guest_meals drop constraint if exists guest_meals_pkey;
alter table public.guest_meals add constraint guest_meals_pkey primary key (period_id, meal_date);
drop index if exists public.idx_guest_meals_period_date;
create index if not exists idx_guest_meals_meal_date on public.guest_meals (meal_date);

create or replace function public.guard_guest_meal_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.breakfast_guests > 0 and private.get_meal_period(new.meal_date, 'breakfast') is distinct from new.period_id)
     or (new.lunch_guests > 0 and private.get_meal_period(new.meal_date, 'lunch') is distinct from new.period_id)
     or (new.dinner_guests > 0 and private.get_meal_period(new.meal_date, 'dinner') is distinct from new.period_id) then
    raise exception 'GUEST_MEAL_PERIOD: Guests on % can only be declared for the meals of your own period.', new.meal_date
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_guest_meal_owner() from public, anon;

drop trigger if exists trg_guest_meals_guard_owner on public.guest_meals;
create trigger trg_guest_meals_guard_owner
  before insert or update on public.guest_meals
  for each row execute function public.guard_guest_meal_owner();

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
        and guest_meals.meal_date <= p.end_date
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
        and guest_meals.meal_date <= p.end_date
    )
  );

-- The cook's board adds up today's rows (on the 5th, one from each period).
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
  select g.meal_date,
         sum(g.breakfast_guests)::integer,
         sum(g.lunch_guests)::integer,
         sum(g.dinner_guests)::integer
    from public.guest_meals g
   where g.meal_date = (now() at time zone 'Asia/Dhaka')::date
   group by g.meal_date;
$$;

-- Spending: a payment on the 5th can be either manager's; each records it
-- in their own period.
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
        and spending_records.spent_on <= p.end_date
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
        and spending_records.spent_on <= p.end_date
    )
  );

-- ---------------------------------------------------------------------------
-- 7. No account change can delete business history
-- ---------------------------------------------------------------------------

-- Each of these cascaded before. RESTRICT makes the delete fail instead:
-- a manager login can't be deleted while its profile exists, a profile
-- while its period exists, a period while it has meal counts, deposits,
-- guests or spending, and an employee while they have meal records.
alter table public.admin_profiles
  drop constraint if exists admin_profiles_id_fkey,
  add constraint admin_profiles_id_fkey
    foreign key (id) references auth.users (id) on delete restrict;

alter table public.mess_periods
  drop constraint if exists mess_periods_manager_id_fkey,
  add constraint mess_periods_manager_id_fkey
    foreign key (manager_id) references public.admin_profiles (id) on delete restrict;

alter table public.meal_day_weights
  drop constraint if exists meal_day_weights_period_id_fkey,
  add constraint meal_day_weights_period_id_fkey
    foreign key (period_id) references public.mess_periods (id) on delete restrict;

alter table public.deposits
  drop constraint if exists deposits_period_id_fkey,
  add constraint deposits_period_id_fkey
    foreign key (period_id) references public.mess_periods (id) on delete restrict;

alter table public.guest_meals
  drop constraint if exists guest_meals_period_id_fkey,
  add constraint guest_meals_period_id_fkey
    foreign key (period_id) references public.mess_periods (id) on delete restrict;

alter table public.spending_records
  drop constraint if exists spending_records_period_id_fkey,
  add constraint spending_records_period_id_fkey
    foreign key (period_id) references public.mess_periods (id) on delete restrict;

alter table public.meal_records
  drop constraint if exists meal_records_employee_id_fkey,
  add constraint meal_records_employee_id_fkey
    foreign key (employee_id) references public.employees (id) on delete restrict;
