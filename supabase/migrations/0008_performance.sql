-- Performance pass.
--
-- 1. RLS policies called auth.uid() directly, which Postgres re-evaluates for
--    every row (Supabase advisor lint 0003). Wrapping it as (select auth.uid())
--    makes it an init-plan evaluated once per query.
-- 2. deposits / meal_day_weights policies called a SECURITY DEFINER function
--    per row. They now use a single `period_id in (own periods)` subquery,
--    which the planner evaluates once.
-- 3. get_dashboard_stats(): the dashboard needed three round trips (active
--    employee count, today's meals, full report) and summed ~150 rows in the
--    app. One RPC now returns the single summary row.

-- ---------------------------------------------------------------------------
-- 1. auth.uid() init-plan
-- ---------------------------------------------------------------------------

drop policy if exists admin_profiles_self_select on public.admin_profiles;
create policy admin_profiles_self_select
  on public.admin_profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists mess_periods_owner_select on public.mess_periods;
create policy mess_periods_owner_select
  on public.mess_periods for select
  to authenticated
  using (manager_id = (select auth.uid()));

drop policy if exists mess_periods_owner_update on public.mess_periods;
create policy mess_periods_owner_update
  on public.mess_periods for update
  to authenticated
  using (manager_id = (select auth.uid()))
  with check (manager_id = (select auth.uid()));

drop policy if exists meal_records_admin_delete on public.meal_records;
create policy meal_records_admin_delete
  on public.meal_records for delete
  to authenticated
  using (
    exists (
      select 1 from public.mess_periods p
      where p.manager_id = (select auth.uid())
        and meal_records.meal_date >= p.start_date
        and meal_records.meal_date < p.end_date
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Period-owned tables: one subquery instead of a function call per row
-- ---------------------------------------------------------------------------

drop policy if exists meal_day_weights_owner_select on public.meal_day_weights;
create policy meal_day_weights_owner_select
  on public.meal_day_weights for select
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

-- The date must fall inside the owning period.
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
        and meal_day_weights.meal_date < p.end_date
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
        and meal_day_weights.meal_date < p.end_date
    )
  );

drop policy if exists meal_day_weights_owner_delete on public.meal_day_weights;
create policy meal_day_weights_owner_delete
  on public.meal_day_weights for delete
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

drop policy if exists deposits_owner_select on public.deposits;
create policy deposits_owner_select
  on public.deposits for select
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

drop policy if exists deposits_owner_insert on public.deposits;
create policy deposits_owner_insert
  on public.deposits for insert
  to authenticated
  with check (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

drop policy if exists deposits_owner_delete on public.deposits;
create policy deposits_owner_delete
  on public.deposits for delete
  to authenticated
  using (period_id in (select id from public.mess_periods where manager_id = (select auth.uid())));

-- No policy uses these any more.
drop function if exists private.owns_period(uuid);
drop function if exists private.date_in_period(uuid, date);

-- ---------------------------------------------------------------------------
-- 3. Dashboard summary in one round trip
-- ---------------------------------------------------------------------------

-- p_today is passed in (office timezone, Asia/Dhaka) rather than using
-- current_date, which is UTC on the server. SECURITY INVOKER: built on
-- get_period_report, so a period the caller doesn't own yields no row.
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
    select id, start_date, end_date, meal_rate from public.mess_periods where id = p_period_id
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
    p_today >= period.start_date and p_today < period.end_date,
    today.breakfast,
    today.lunch,
    today.dinner,
    coalesce((select sum(meal_count) from report), 0),
    coalesce((select sum(total_deposit) from report), 0),
    case when period.meal_rate is null then null
         else coalesce((select sum(total_bill) from report), 0) end,
    case when period.meal_rate is null then null
         else coalesce((select sum(-balance) from report where balance < 0), 0) end
  from period cross join today;
$$;

revoke all on function public.get_dashboard_stats(uuid, date) from public;
revoke execute on function public.get_dashboard_stats(uuid, date) from anon;
grant execute on function public.get_dashboard_stats(uuid, date) to authenticated;
