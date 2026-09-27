-- The signed-in employee's own meals for one mess month, day by day, with
-- that day's meal counts (weights).
--
-- The Employee Panel counts only meals that are already past (their day is
-- over, or today's deadline has passed), so it needs each day separately
-- rather than get_my_statement's month total. Weights come from the month's
-- meal_day_weights (defaults 0.75 / 1.25 / 1.00), which employees can't read
-- directly — hence SECURITY DEFINER; it only ever answers for the caller's
-- own employee. Additive only: nothing existing changes.

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
  select
    mr.meal_date,
    mr.breakfast,
    mr.lunch,
    mr.dinner,
    coalesce(w.breakfast_weight, 0.75),
    coalesce(w.lunch_weight, 1.25),
    coalesce(w.dinner_weight, 1.00)
  from public.meal_records mr
  left join public.mess_periods p
    on p.start_date = p_start
  left join public.meal_day_weights w
    on w.period_id = p.id and w.meal_date = mr.meal_date
  where mr.employee_id = private.my_employee_id()
    and mr.meal_date >= p_start
    and mr.meal_date < (p_start + interval '1 month')::date
    and (mr.breakfast or mr.lunch or mr.dinner)
    and extract(day from p_start) = 5
  order by mr.meal_date;
$$;

revoke all on function public.get_my_meal_days(date) from public;
revoke all on function public.get_my_meal_days(date) from anon;
grant execute on function public.get_my_meal_days(date) to authenticated;
