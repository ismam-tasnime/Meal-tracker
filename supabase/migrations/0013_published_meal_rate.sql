-- Test vs. published meal rate.
--
-- The mess manager can try meal rates all month long ("Test meal rate"):
-- that is mess_periods.meal_rate, which only the manager's own pages
-- (Dashboard, Expense Status, Report) bill with. Employees never see it.
--
-- "Publish meal rate" also copies the rate into published_meal_rate, and
-- from then on every employee's panel shows it with their own bill:
--
--   total bill = meal count × published rate
--   balance    = total deposit − total bill (> 0 refund, < 0 due)
--
-- Testing another rate after publishing changes only the manager's pages;
-- employees keep seeing the published rate until the manager publishes
-- again (or unpublishes, which sets it back to null).
--
-- Additive: two new columns and a new version of get_my_statement().

alter table public.mess_periods
  add column if not exists published_meal_rate numeric(10, 2)
    check (published_meal_rate is null or published_meal_rate >= 0),
  add column if not exists rate_published_at timestamptz;

-- The owning team may publish (the 0008 owner-update policy still limits
-- it to their own period). rate_published_at is set by the trigger below,
-- never by the client.
grant update (published_meal_rate) on public.mess_periods to authenticated;

create or replace function public.stamp_rate_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published_meal_rate is distinct from old.published_meal_rate then
    new.rate_published_at := case when new.published_meal_rate is null then null else now() end;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_rate_published_at() from public;

drop trigger if exists trg_mess_periods_stamp_published on public.mess_periods;
create trigger trg_mess_periods_stamp_published
  before update on public.mess_periods
  for each row execute function public.stamp_rate_published_at();

-- ---------------------------------------------------------------------------
-- An employee's own bill: now priced at the PUBLISHED rate only
-- ---------------------------------------------------------------------------

-- Same as 0010 except meal_rate / total_bill / balance come from
-- published_meal_rate (null until the manager publishes), and it also
-- returns when the rate was published. The return type changes, so the
-- old version has to be dropped first.
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
  range as (
    select p_start as start_date, (p_start + interval '1 month')::date as end_date
  ),
  period as (
    select p.id, p.published_meal_rate as meal_rate, p.rate_published_at
      from public.mess_periods p, range
     where p.start_date = range.start_date
  ),
  meals as (
    select
      count(*) filter (where mr.breakfast) as breakfast_count,
      count(*) filter (where mr.lunch) as lunch_count,
      count(*) filter (where mr.dinner) as dinner_count,
      coalesce(sum(
        (case when mr.breakfast then coalesce(w.breakfast_weight, 0.75) else 0 end)
        + (case when mr.lunch then coalesce(w.lunch_weight, 1.25) else 0 end)
        + (case when mr.dinner then coalesce(w.dinner_weight, 1.00) else 0 end)
      ), 0) as meal_count
    from public.meal_records mr
    cross join range
    join me on mr.employee_id = me.employee_id
    left join period on true
    left join public.meal_day_weights w
      on w.period_id = period.id and w.meal_date = mr.meal_date
    where mr.meal_date >= range.start_date and mr.meal_date < range.end_date
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

revoke all on function public.get_my_statement(date) from public;
revoke all on function public.get_my_statement(date) from anon;
grant execute on function public.get_my_statement(date) to authenticated;
