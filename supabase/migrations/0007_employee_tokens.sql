-- Employee token numbers.
--
-- The office identifies people by token number (TKN) — several employees
-- share a name, so the token is what tells them apart. Optional (not every
-- mess member has one) but unique when set. Lists are ordered by token.

alter table public.employees
  add column if not exists token_no integer check (token_no is null or token_no >= 0);

create unique index if not exists employees_token_no_key
  on public.employees (token_no) where token_no is not null;

-- Report gains token_no and is ordered by it (return type changes, so the
-- function is dropped and recreated).
drop function if exists public.get_period_report(uuid);

-- SECURITY INVOKER: every table read goes through RLS, so a caller who
-- doesn't own p_period_id gets zero rows. Lists every employee who is
-- active or had meals/deposits in the period, so people who joined or left
-- mid-month are billed for exactly what they ate.
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

revoke all on function public.get_period_report(uuid) from public;
revoke execute on function public.get_period_report(uuid) from anon;
grant execute on function public.get_period_report(uuid) to authenticated;
