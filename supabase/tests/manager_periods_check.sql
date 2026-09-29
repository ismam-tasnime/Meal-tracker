-- Checks manager periods (migration 0015): whose meal each meal is, when a
-- manager may change employee meals, that bills count exactly their own
-- period's meals, that a finished manager keeps everything except changing
-- meals, and that no account change can delete business data. Paste into
-- the Supabase SQL editor and Run; one row per check, every row should say
-- PASS.
--
-- Safe on the live project: changes nothing. Every check runs in its own
-- sub-transaction that is always rolled back, fixtures included. The
-- fixture months are in 2096-2100 and 2000, so they can't overlap a real
-- one. The "today" checks use the real months around today: they act as
-- that month's real manager (as the app would) but only ever touch two
-- throwaway employees' meals, and are rolled back too.
--
-- Who's asking: "AUG"/"SEP"/"OCT" are the managers of the 2099 fixture
-- months, "OLD" of a finished month in 2000; "P", "C", "N" are the managers
-- of the previous, current and next month around today; "EMP" is a
-- signed-in employee; "anon" is signed out; "postgres" is the SQL editor.

-- Runs one statement; says whether it went through, and keeps the error
-- code when it didn't (23503 = blocked by a foreign key).
create or replace function pg_temp.mp_try(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'done';
exception when others then
  return 'blocked (' || sqlstate || ')';
end;
$$;

-- What a fixture month owns right now, row by row.
create or replace function pg_temp.mp_counts(p_period uuid)
returns text
language sql
as $$
  select format('periods=%s deposits=%s weights=%s guests=%s spending=%s meal_records=%s',
    (select count(*) from public.mess_periods where id = p_period),
    (select count(*) from public.deposits where period_id = p_period),
    (select count(*) from public.meal_day_weights where period_id = p_period),
    (select count(*) from public.guest_meals where period_id = p_period),
    (select count(*) from public.spending_records where period_id = p_period),
    (select count(*) from public.meal_records where employee_id = md5('mp-employee-e')::uuid));
$$;

-- Whose meal: the owning month's fixture tag ("aug", "sep", …), a real
-- month's manager name, or "none".
create or replace function pg_temp.mp_owner(p_date date, p_meal text)
returns text
language sql
as $$
  select coalesce(
    (select replace(a.full_name, 'zz mp ', '')
       from public.mess_periods p
       join public.admin_profiles a on a.id = p.manager_id
      where p.id = private.get_meal_period(p_date, p_meal)),
    'none');
$$;

create or replace function pg_temp.manager_periods_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_tags text[] := array['feb96', 'dec98', 'jan', 'feb', 'mar', 'apr', 'aug', 'sep', 'oct', 'old'];
  v_starts date[] := array['2096-02-05', '2098-12-05', '2099-01-05', '2099-02-05', '2099-03-05',
                           '2099-04-05', '2099-08-05', '2099-09-05', '2099-10-05', '2000-01-05']::date[];
  v_emp constant uuid := md5('mp-employee-e')::uuid;
  v_emp2 constant uuid := md5('mp-employee-e2')::uuid;
  v_login constant uuid := md5('mp-login-e')::uuid;
  v_c uuid;
  v_p uuid;
  v_n uuid;
  v_c_start date;
  v_c_end date;
  v_keys text[];
  v_vals text[];
  v_who uuid;
  v_stmt text;
  v_expected text;
  v_got text;
  c record;
begin
  check_no := 0;
  check_name := 'Migration 0015 installed (manager periods)';
  expected := 'yes';
  got := case when to_regprocedure('private.get_meal_period(date, text)') is not null
               and to_regprocedure('public.enforce_manager_meal_period()') is not null
              then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, who, setup (run first, as the SQL editor), sql, expected

      -- A. Whose meal is it? (the eight boundary cases) -------------------
      (1,  'Case 1: 4 Sep dinner is the August manager''s', 'postgres', null::text[],
           $s$select pg_temp.mp_owner('2099-09-04', 'dinner')$s$, 'aug'),
      (2,  'Case 2: 5 Sep breakfast is NOT September''s (August''s)', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-09-05', 'breakfast')$s$, 'aug'),
      (3,  'Case 3: 5 Sep lunch is September''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-09-05', 'lunch')$s$, 'sep'),
      (4,  'Case 4: 4 Oct dinner is September''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-10-04', 'dinner')$s$, 'sep'),
      (5,  'Case 5: 5 Oct breakfast is September''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-10-05', 'breakfast')$s$, 'sep'),
      (6,  'Case 6: 5 Oct lunch is October''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-10-05', 'lunch')$s$, 'oct'),
      (7,  'Case 7: 5 Oct dinner is October''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-10-05', 'dinner')$s$, 'oct'),
      (8,  'Case 8: 6 Oct breakfast is October''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-10-06', 'breakfast')$s$, 'oct'),

      -- B. Month and year transitions -------------------------------------
      (10, 'Dec -> Jan: 5 Jan breakfast is December''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-01-05', 'breakfast')$s$, 'dec98'),
      (11, 'Dec -> Jan: 5 Jan lunch is January''s (new year)', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-01-05', 'lunch')$s$, 'jan'),
      (12, 'Jan -> Feb: 5 Feb breakfast is January''s, lunch February''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-02-05', 'breakfast') || '/' || pg_temp.mp_owner('2099-02-05', 'lunch')$s$, 'jan/feb'),
      (13, 'Feb -> Mar (28 days): 28 Feb dinner and 5 Mar breakfast are February''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2099-02-28', 'dinner') || '/' || pg_temp.mp_owner('2099-03-05', 'breakfast') || '/' || pg_temp.mp_owner('2099-03-05', 'lunch')$s$, 'feb/feb/mar'),
      (14, 'Leap year: 29 Feb 2096 and 5 Mar 2096 breakfast are February''s', 'postgres', null,
           $s$select pg_temp.mp_owner('2096-02-29', 'lunch') || '/' || pg_temp.mp_owner('2096-03-05', 'breakfast') || '/' || pg_temp.mp_owner('2096-03-05', 'lunch')$s$, 'feb96/feb96/none'),
      (15, 'Each month owns exactly 3 meals x its days (28/29/30/31)', 'postgres', null,
           $s$select string_agg(replace(a.full_name, 'zz mp ', '') || '=' || (p.last_slot - p.first_slot + 1), ' ' order by p.start_date)
                from public.mess_periods p join public.admin_profiles a on a.id = p.manager_id
               where a.full_name like 'zz mp %' and a.full_name not in ('zz mp old', 'zz mp bad')
                 and a.full_name not like 'zz mp today%'$s$,
           'feb96=87 dec98=93 jan=93 feb=84 mar=93 apr=90 aug=93 sep=90 oct=93'),
      (16, 'Consecutive months meet exactly: no gap, no overlap', 'postgres', null,
           $s$select count(*) filter (where n.first_slot = p.last_slot + 1) || ' of ' || count(*)
                from public.mess_periods p
                join public.mess_periods n on n.start_date = p.end_date
                join public.admin_profiles a on a.id = p.manager_id
                join public.admin_profiles b on b.id = n.manager_id
               where a.full_name like 'zz mp %' and a.full_name not like 'zz mp today%'
                 and b.full_name like 'zz mp %' and b.full_name not like 'zz mp today%'$s$, '6 of 6'),
      (17, 'A month overlapping another by one meal is refused', 'postgres',
           array[$s$insert into auth.users (id, email, aud, role) values (md5('mp-manager-bad')::uuid, 'zz-mp-bad@mess-manager.test', 'authenticated', 'authenticated')$s$,
                 $s$insert into public.admin_profiles (id, full_name) values (md5('mp-manager-bad')::uuid, 'zz mp bad')$s$],
           $s$insert into public.mess_periods (manager_id, start_date, start_meal, end_date, end_meal)
              values (md5('mp-manager-bad')::uuid, '2099-11-05', 'breakfast', '2099-12-05', 'breakfast') returning 'ALLOW'$s$, 'REJECT'),
      (18, 'Sign-up creates the standard month: 5th lunch -> next 5th breakfast', 'postgres',
           array[$s$insert into auth.users (id, email, aud, role) values (md5('mp-manager-jun')::uuid, 'mess-2099-06@mess-manager.app', 'authenticated', 'authenticated')$s$,
                 $s$select set_config('request.jwt.claims', json_build_object('sub', md5('mp-manager-jun')::uuid, 'email', 'mess-2099-06@mess-manager.app', 'role', 'authenticated')::text, true)$s$,
                 $s$select public.register_mess_manager()$s$],
           $s$select start_date || ' ' || start_meal || ' -> ' || end_date || ' ' || end_meal
                from public.mess_periods where manager_id = md5('mp-manager-jun')::uuid$s$,
           '2099-06-05 lunch -> 2099-07-05 breakfast'),

      -- C. When is a month open for changing meals? (Bangladesh time) -----
      (20, 'September 2099 at 4 Sep 23:59:59: not started', 'postgres', null,
           $s$select private.period_status('2099-09-05', '2099-10-05', '2099-09-04 23:59:59+06')$s$, 'upcoming'),
      (21, 'September 2099 at 5 Sep 00:00: active', 'postgres', null,
           $s$select private.period_status('2099-09-05', '2099-10-05', '2099-09-05 00:00+06')$s$, 'active'),
      (22, 'September 2099 at 5 Oct 23:59:59: still active (its last day)', 'postgres', null,
           $s$select private.period_status('2099-09-05', '2099-10-05', '2099-10-05 23:59:59+06')$s$, 'active'),
      (23, 'September 2099 at 6 Oct 00:00: completed', 'postgres', null,
           $s$select private.period_status('2099-09-05', '2099-10-05', '2099-10-06 00:00+06')$s$, 'completed'),
      (24, 'Bangladesh time, not UTC: 5 Oct 18:30 UTC is already 6 Oct', 'postgres', null,
           $s$select private.period_status('2099-09-05', '2099-10-05', '2099-10-05 18:30+00')$s$, 'completed'),

      -- D. Who may change which meal, at exact moments --------------------
      (30, 'On 5 Oct, the September manager can change 5 Oct breakfast', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'breakfast', '2099-10-05 12:00+06')::text$s$, 'true'),
      (31, 'On 5 Oct, the September manager can NOT change 5 Oct lunch', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'lunch', '2099-10-05 12:00+06')::text$s$, 'false'),
      (32, 'On 5 Oct, the September manager can NOT change 5 Oct dinner', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'dinner', '2099-10-05 12:00+06')::text$s$, 'false'),
      (33, 'The September manager can NOT change 6 Oct breakfast', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-10-06', 'breakfast', '2099-10-05 12:00+06')::text$s$, 'false'),
      (34, 'The September manager can NOT change 5 Sep breakfast (August''s)', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-09-05', 'breakfast', '2099-09-20 12:00+06')::text$s$, 'false'),
      (35, 'The September manager can change 5 Sep lunch', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-09-05', 'lunch', '2099-09-20 12:00+06')::text$s$, 'true'),
      (36, 'On 5 Oct, the October manager can change 5 Oct lunch', 'OCT', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'lunch', '2099-10-05 12:00+06')::text$s$, 'true'),
      (37, 'The October manager can NOT change 5 Oct breakfast', 'OCT', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'breakfast', '2099-10-05 12:00+06')::text$s$, 'false'),
      (38, 'The October manager can NOT change September''s meals (20 Sep)', 'OCT', null,
           $s$select private.manager_can_change_meal('2099-09-20', 'dinner', '2099-10-05 12:00+06')::text$s$, 'false'),
      (39, 'Before 5 Oct, the October manager can NOT change even its own meals', 'OCT', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'lunch', '2099-10-04 23:59+06')::text$s$, 'false'),
      (40, 'After 5 Oct, the September manager can NOT change 5 Oct breakfast', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-10-05', 'breakfast', '2099-10-06 00:00+06')::text$s$, 'false'),
      (41, 'After 5 Oct, the September manager can NOT change its own 20 Sep', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-09-20', 'lunch', '2099-10-06 00:00+06')::text$s$, 'false'),
      (42, 'On 5 Sep, the August manager can still change 5 Sep breakfast', 'AUG', null,
           $s$select private.manager_can_change_meal('2099-09-05', 'breakfast', '2099-09-05 08:00+06')::text$s$, 'true'),
      (43, 'From 6 Sep, the August manager can''t change anything', 'AUG', null,
           $s$select private.manager_can_change_meal('2099-09-05', 'breakfast', '2099-09-06 00:00+06')::text$s$, 'false'),
      (44, 'An employee login is never a manager', 'EMP', null,
           $s$select private.manager_can_change_meal('2099-09-20', 'lunch', '2099-09-20 12:00+06')::text$s$, 'false'),
      (45, 'A finished manager can NOT move its period to free dates (to change meals again)', 'OLD', null,
           $s$update public.mess_periods set start_date = '2099-05-05', end_date = '2099-06-05' where id = {OLD}::uuid returning 'ALLOW'$s$, 'REJECT'),
      (46, 'A manager can NOT change its own first/last meal', 'SEP', null,
           $s$update public.mess_periods set end_date = '2099-10-04', end_meal = 'dinner' where id = {SEP}::uuid returning 'ALLOW'$s$, 'REJECT'),
      (47, 'A finished manager can NOT give itself a new period', 'OLD', null,
           $s$insert into public.mess_periods (manager_id, start_date, end_date)
              values (md5('mp-manager-old')::uuid, '2099-05-05', '2099-06-05') returning 'ALLOW'$s$, 'REJECT'),
      (48, 'A manager can NOT delete its period', 'SEP', null,
           $s$delete from public.mess_periods where id = {SEP}::uuid returning 'ALLOW'$s$, 'REJECT'),

      -- E. Real writes today, through RLS and the trigger -----------------
      -- C = the manager of today's month, P = the month before, N = the month
      -- after; E/E2 are throwaway employees. Rows: E all ON on C_START-1,
      -- C_START and C_END; E2 lunch+dinner ON today.
      (50, 'Current manager changes today''s lunch', 'C', null,
           $s$with u as (update public.meal_records set lunch = not lunch where employee_id = {E2}::uuid and meal_date = {T}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'ALLOW'),
      (51, 'Current manager changes its last meal (next 5th breakfast)', 'C', null,
           $s$with u as (update public.meal_records set breakfast = false where employee_id = {E}::uuid and meal_date = {C_END}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'ALLOW'),
      (52, 'Current manager can NOT change the next month''s first meal (next 5th lunch)', 'C', null,
           $s$with u as (update public.meal_records set lunch = false where employee_id = {E}::uuid and meal_date = {C_END}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'REJECT'),
      (53, 'Current manager can NOT change its 5th''s breakfast (previous month''s)', 'C', null,
           $s$with u as (update public.meal_records set breakfast = false where employee_id = {E}::uuid and meal_date = {C_START}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'REJECT'),
      (54, 'Current manager changes its first meal (5th lunch)', 'C', null,
           $s$with u as (update public.meal_records set lunch = false where employee_id = {E}::uuid and meal_date = {C_START}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'ALLOW'),
      (55, 'Current manager can NOT change the previous month''s meals (RLS: row not writable)', 'C', null,
           $s$with u as (update public.meal_records set lunch = false where employee_id = {E}::uuid and meal_date = {C_START}::date - 1 returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'REJECT: no rows changed'),
      (56, 'Current manager can NOT delete the previous month''s meals (RLS)', 'C', null,
           $s$with d as (delete from public.meal_records where employee_id = {E}::uuid and meal_date = {C_START}::date - 1 returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from d$s$, 'REJECT: no rows changed'),
      (57, 'Current manager deletes a row of its own meals', 'C', null,
           $s$with d as (delete from public.meal_records where employee_id = {E2}::uuid and meal_date = {T}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from d$s$, 'ALLOW'),
      (58, 'Current manager sets tomorrow''s breakfast (inside its month)', 'C', null,
           $s$insert into public.meal_records (employee_id, meal_date, breakfast) values ({E2}::uuid, {T}::date + 1, true)
              on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast returning 'ALLOW'$s$, 'ALLOW'),
      (59, 'One write touching its own and the next month''s meal is refused whole', 'C', null,
           $s$update public.meal_records set breakfast = false, lunch = false
               where employee_id = {E}::uuid and meal_date = {C_END}::date returning 'ALLOW'$s$, 'REJECT'),
      (60, 'Current manager can NOT create meals in the next month (2nd day)', 'C', null,
           $s$insert into public.meal_records (employee_id, meal_date, lunch) values ({E2}::uuid, {C_END}::date + 1, true) returning 'ALLOW'$s$, 'REJECT'),
      (61, 'Next month''s manager can NOT change meals before its month starts (RLS)', 'N', null,
           $s$with u as (update public.meal_records set lunch = false where employee_id = {E}::uuid and meal_date = {C_END}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'REJECT: no rows changed'),
      (62, 'Previous month''s manager: its last meal only on its last day (the 5th)', 'P', null,
           $s$with u as (update public.meal_records set breakfast = false where employee_id = {E}::uuid and meal_date = {C_START}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'ALLOW_ON_HANDOVER'),
      (63, 'Previous month''s manager can NOT change the current month''s meals', 'P', null,
           $s$with u as (update public.meal_records set lunch = not lunch where employee_id = {E2}::uuid and meal_date = {T}::date returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'REJECT'),
      (64, 'Employee still changes their own future meal (deadlines unchanged)', 'EMP', null,
           $s$insert into public.meal_records (employee_id, meal_date, breakfast) values ({E}::uuid, {T}::date + 2, true)
              on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast returning 'ALLOW'$s$, 'ALLOW'),
      (65, 'Employee still can''t change a previous day (deadlines unchanged)', 'EMP', null,
           $s$update public.meal_records set lunch = false where employee_id = {E}::uuid and meal_date = {C_START}::date - 1 returning 'ALLOW'$s$, 'REJECT'),
      (66, 'Signed out still can''t change a meal', 'anon', null,
           $s$insert into public.meal_records (employee_id, meal_date, lunch) values ({E2}::uuid, {T}::date + 1, true) returning 'ALLOW'$s$, 'REJECT'),
      (67, 'Current manager''s panel status: active', 'C', null,
           $s$select period_status from public.get_my_meal_access({T}::date)$s$, 'active'),
      (68, 'Next month''s manager''s panel status: not started', 'N', null,
           $s$select period_status from public.get_my_meal_access({T}::date)$s$, 'upcoming'),
      (69, 'Previous month''s manager''s panel status: completed (active on the 5th)', 'P', null,
           $s$select period_status from public.get_my_meal_access({T}::date)$s$, 'STATUS_P'),
      (70, 'Panel access for the next 5th: breakfast mine and changeable, lunch/dinner not', 'C', null,
           $s$select concat_ws('/', breakfast_owned, lunch_owned, dinner_owned, breakfast_can_change, lunch_can_change, dinner_can_change)
                from public.get_my_meal_access({C_END}::date)$s$, 't/f/f/t/f/f'),
      (71, 'Panel access for its own 5th: lunch/dinner mine, breakfast not', 'C', null,
           $s$select concat_ws('/', breakfast_owned, lunch_owned, dinner_owned, breakfast_can_change, lunch_can_change, dinner_can_change)
                from public.get_my_meal_access({C_START}::date)$s$, 'f/t/t/f/t/t'),
      (72, 'Cook''s board adds up today''s guests from every month', 'anon',
           array[$s$insert into public.guest_meals (period_id, meal_date, breakfast_guests) values ({BF_OWNER}::uuid, {T}::date, 7)
                   on conflict (period_id, meal_date) do update set breakfast_guests = 7$s$,
                 $s$insert into public.guest_meals (period_id, meal_date, lunch_guests, dinner_guests) values ({C}::uuid, {T}::date, 8, 9)
                   on conflict (period_id, meal_date) do update set lunch_guests = 8, dinner_guests = 9$s$],
           $s$select format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests) from public.get_today_guest_meals()$s$, '7/8/9'),

      -- F. A finished month keeps everything but meal changes -------------
      (80, 'Finished manager still signs in to a "completed" month', 'OLD', null,
           $s$select period_status from public.get_my_meal_access('2000-01-10')$s$, 'completed'),
      (81, 'Finished manager still sees its report', 'OLD', null,
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report({OLD}::uuid) where employee_id = {E}::uuid$s$, '0/1/0 1.25'),
      (82, 'Finished manager still sees deposits, guests and spending', 'OLD', null,
           $s$select (select sum(amount) from public.deposits) || ' / ' || (select count(*) from public.guest_meals) || ' / ' || (select sum(amount) from public.spending_records)$s$,
           '500.00 / 1 / 100.00'),
      (83, 'Finished manager can NOT change its own month''s meals any more (RLS)', 'OLD', null,
           $s$with u as (update public.meal_records set lunch = false where employee_id = {E}::uuid and meal_date = '2000-01-10' returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'REJECT: no rows changed'),
      (84, 'Finished manager still records a deposit (cash collection)', 'OLD', null,
           $s$insert into public.deposits (period_id, employee_id, amount) values ({OLD}::uuid, {E}::uuid, 250) returning 'ALLOW'$s$, 'ALLOW'),
      (85, 'Finished manager still sets the meal rate', 'OLD', null,
           $s$with u as (update public.mess_periods set meal_rate = 60 where id = {OLD}::uuid returning 1)
              select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from u$s$, 'ALLOW'),
      (86, 'Finished manager still edits meal counts, guests and spending', 'OLD', null,
           $s$with w as (insert into public.meal_day_weights (period_id, meal_date, lunch_weight) values ({OLD}::uuid, '2000-01-10', 2)
                         on conflict (period_id, meal_date) do update set lunch_weight = 2 returning 1),
                   g as (update public.guest_meals set lunch_guests = 4 where period_id = {OLD}::uuid returning 1),
                   s as (insert into public.spending_records (period_id, spent_on, person_name, amount) values ({OLD}::uuid, '2000-01-20', 'Rahim', 50) returning 1)
              select (select count(*) from w) || '/' || (select count(*) from g) || '/' || (select count(*) from s)$s$, '1/1/1'),
      (87, 'Finished month''s bill follows those edits', 'OLD',
           array[$s$update public.mess_periods set meal_rate = 60 where id = {OLD}::uuid$s$,
                 $s$insert into public.meal_day_weights (period_id, meal_date, lunch_weight) values ({OLD}::uuid, '2000-01-10', 2)$s$],
           $s$select meal_count || ' x 60 = ' || total_bill from public.get_period_report({OLD}::uuid) where employee_id = {E}::uuid$s$, '2.00 x 60 = 120.00'),

      -- G. Bills count exactly each month's meals (E ate every meal of
      --    4 Sep, 5 Sep, 4 Oct, 5 Oct, 6 Oct 2099) -----------------------
      (90, 'August bill: 4 Sep + 5 Sep breakfast (with August''s 5 Sep count)', 'AUG', null,
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report({AUG}::uuid) where employee_id = {E}::uuid$s$, '2/1/1 4.50'),
      (91, 'September bill: 5 Sep lunch+dinner, 4 Oct, 5 Oct breakfast', 'SEP', null,
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report({SEP}::uuid) where employee_id = {E}::uuid$s$, '2/2/2 10.00'),
      (92, 'October bill: 5 Oct lunch+dinner, 6 Oct', 'OCT', null,
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report({OCT}::uuid) where employee_id = {E}::uuid$s$, '1/2/2 7.00'),
      (93, 'Every meal billed exactly once across the three months (15 of 15)', 'postgres', null,
           $s$select sum(breakfast_count + lunch_count + dinner_count) || ' of 15'
                from (select * from public.get_period_report({AUG}::uuid)
                      union all select * from public.get_period_report({SEP}::uuid)
                      union all select * from public.get_period_report({OCT}::uuid)) r
               where r.employee_id = {E}::uuid$s$, '15 of 15'),
      (94, 'Employee''s own September bill matches the manager''s', 'EMP', null,
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_my_statement('2099-09-05')$s$, '2/2/2 10.00'),
      (95, 'Employee''s September days: 5 Sep without breakfast, 5 Oct breakfast only', 'EMP', null,
           $s$select string_agg(to_char(meal_date, 'MM-DD') || ' ' || breakfast::int || lunch::int || dinner::int, ', ' order by meal_date)
                from public.get_my_meal_days('2099-09-05')$s$, '09-05 011, 10-04 111, 10-05 100'),
      (96, 'A month nobody manages yet uses the same bounds', 'EMP', null,
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_my_statement('2099-12-05')$s$, '1/1/1 3.00'),
      (97, 'Dashboard total for September matches its bill', 'SEP', null,
           $s$select meal_count::text from public.get_dashboard_stats({SEP}::uuid, '2099-09-20')$s$, '10.00'),
      (98, 'September''s dashboard on 5 Oct: today''s breakfast only', 'SEP', null,
           $s$select concat_ws('/', today_in_period, coalesce(today_breakfast::text, '-'), coalesce(today_lunch::text, '-'), coalesce(today_dinner::text, '-'))
                from public.get_dashboard_stats({SEP}::uuid, '2099-10-05')$s$, 't/1/-/-'),
      (99, 'October''s dashboard on 5 Oct: today''s lunch and dinner only', 'OCT', null,
           $s$select concat_ws('/', today_in_period, coalesce(today_breakfast::text, '-'), coalesce(today_lunch::text, '-'), coalesce(today_dinner::text, '-'))
                from public.get_dashboard_stats({OCT}::uuid, '2099-10-05')$s$, 't/-/1/1'),

      -- H. Guests, spending and meal counts on the 5th --------------------
      (100, 'September declares 5 Oct breakfast guests', 'SEP', null,
           $s$insert into public.guest_meals (period_id, meal_date, breakfast_guests) values ({SEP}::uuid, '2099-10-05', 5) returning 'ALLOW'$s$, 'ALLOW'),
      (101, 'September can NOT declare 5 Oct lunch guests', 'SEP', null,
           $s$insert into public.guest_meals (period_id, meal_date, lunch_guests) values ({SEP}::uuid, '2099-10-05', 5) returning 'ALLOW'$s$, 'REJECT'),
      (102, 'October declares 5 Oct lunch and dinner guests', 'OCT', null,
           $s$insert into public.guest_meals (period_id, meal_date, lunch_guests, dinner_guests) values ({OCT}::uuid, '2099-10-05', 7, 9) returning 'ALLOW'$s$, 'ALLOW'),
      (103, 'October can NOT declare 5 Oct breakfast guests', 'OCT', null,
           $s$insert into public.guest_meals (period_id, meal_date, breakfast_guests) values ({OCT}::uuid, '2099-10-05', 1) returning 'ALLOW'$s$, 'REJECT'),
      (104, 'September can NOT declare guests on 6 Oct', 'SEP', null,
           $s$insert into public.guest_meals (period_id, meal_date, lunch_guests) values ({SEP}::uuid, '2099-10-06', 1) returning 'ALLOW'$s$, 'REJECT'),
      (105, 'The 5th''s guests stay one count per meal, split by month', 'postgres',
           array[$s$insert into public.guest_meals (period_id, meal_date, breakfast_guests) values ({SEP}::uuid, '2099-10-05', 5)$s$,
                 $s$insert into public.guest_meals (period_id, meal_date, lunch_guests, dinner_guests) values ({OCT}::uuid, '2099-10-05', 7, 9)$s$],
           $s$select string_agg(replace(a.full_name, 'zz mp ', '') || ':' || g.breakfast_guests || '/' || g.lunch_guests || '/' || g.dinner_guests, ' ' order by a.full_name desc)
                from public.guest_meals g
                join public.mess_periods p on p.id = g.period_id
                join public.admin_profiles a on a.id = p.manager_id
               where g.meal_date = '2099-10-05'$s$, 'sep:5/0/0 oct:0/7/9'),
      (106, 'Both managers record spending dated the 5th, each in its own month', 'postgres',
           array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount) values ({SEP}::uuid, '2099-10-05', 'Rahim', 100), ({OCT}::uuid, '2099-10-05', 'Karim', 200)$s$],
           $s$select (select total_amount from public.get_spending_total({SEP}::uuid)) || ' / ' || (select total_amount from public.get_spending_total({OCT}::uuid))$s$,
           '3100.00 / 200.00'),
      (107, 'September records spending on 5 Oct', 'SEP', null,
           $s$insert into public.spending_records (period_id, spent_on, person_name, amount) values ({SEP}::uuid, '2099-10-05', 'Rahim', 100) returning 'ALLOW'$s$, 'ALLOW'),
      (108, 'September can NOT record spending on 6 Oct', 'SEP', null,
           $s$insert into public.spending_records (period_id, spent_on, person_name, amount) values ({SEP}::uuid, '2099-10-06', 'Rahim', 100) returning 'ALLOW'$s$, 'REJECT'),
      (109, 'September sets 5 Oct''s meal count (for its breakfast)', 'SEP', null,
           $s$insert into public.meal_day_weights (period_id, meal_date, breakfast_weight) values ({SEP}::uuid, '2099-10-05', 1)
              on conflict (period_id, meal_date) do update set breakfast_weight = 1 returning 'ALLOW'$s$, 'ALLOW'),
      (110, 'September can NOT set 6 Oct''s meal count', 'SEP', null,
           $s$insert into public.meal_day_weights (period_id, meal_date, breakfast_weight) values ({SEP}::uuid, '2099-10-06', 1) returning 'ALLOW'$s$, 'REJECT'),

      -- I. No account or period change deletes business data --------------
      (120, 'Deleting the manager''s login is blocked; nothing deleted', 'postgres', null,
           $s$select pg_temp.mp_try('delete from auth.users where id = md5(''mp-manager-sep'')::uuid') || ' | ' || pg_temp.mp_counts({SEP}::uuid)$s$,
           'blocked (23503) | periods=1 deposits=1 weights=2 guests=1 spending=1 meal_records=11'),
      (121, 'Deleting the manager profile is blocked; nothing deleted', 'postgres', null,
           $s$select pg_temp.mp_try('delete from public.admin_profiles where id = md5(''mp-manager-sep'')::uuid') || ' | ' || pg_temp.mp_counts({SEP}::uuid)$s$,
           'blocked (23503) | periods=1 deposits=1 weights=2 guests=1 spending=1 meal_records=11'),
      (122, 'Deleting the month itself is blocked; nothing deleted', 'postgres', null,
           $s$select pg_temp.mp_try('delete from public.mess_periods where id = ' || quote_literal({SEP})) || ' | ' || pg_temp.mp_counts({SEP}::uuid)$s$,
           'blocked (23503) | periods=1 deposits=1 weights=2 guests=1 spending=1 meal_records=11'),
      (123, 'Deleting an employee with meal records is blocked; nothing deleted', 'postgres', null,
           $s$select pg_temp.mp_try('delete from public.employees where id = ' || quote_literal({E})) || ' | ' || pg_temp.mp_counts({SEP}::uuid)$s$,
           'blocked (23503) | periods=1 deposits=1 weights=2 guests=1 spending=1 meal_records=11'),
      (124, 'Deleting a login whose month has no data is still blocked', 'postgres', null,
           $s$select pg_temp.mp_try('delete from auth.users where id = md5(''mp-manager-apr'')::uuid')$s$, 'blocked (23503)'),
      (125, 'Disabling (banning) the manager deletes nothing; still a manager', 'postgres', null,
           $s$select pg_temp.mp_try('update auth.users set banned_until = now() + interval ''100 years'' where id = md5(''mp-manager-sep'')::uuid')
                 || ' | ' || pg_temp.mp_counts({SEP}::uuid)
                 || ' | manager=' || exists (select 1 from public.admin_profiles where id = md5('mp-manager-sep')::uuid)$s$,
           'done | periods=1 deposits=1 weights=2 guests=1 spending=1 meal_records=11 | manager=true'),
      (126, 'The next manager signing up deletes nothing; old bill unchanged', 'postgres', null,
           $s$select pg_temp.mp_try($q$
                with u as (insert into auth.users (id, email, aud, role)
                           values (md5('mp-manager-nov')::uuid, 'zz-mp-nov@mess-manager.test', 'authenticated', 'authenticated') returning id),
                     a as (insert into public.admin_profiles (id, full_name) select id, 'zz mp nov' from u returning id)
                insert into public.mess_periods (manager_id, start_date, end_date) select id, '2099-11-05', '2099-12-05' from a$q$)
                 || ' | ' || pg_temp.mp_counts({SEP}::uuid)
                 || ' | ' || (select meal_count from public.get_period_report({SEP}::uuid) where employee_id = {E}::uuid)$s$,
           'done | periods=1 deposits=1 weights=2 guests=1 spending=1 meal_records=11 | 10.00'),
      (127, 'Losing meal-change rights when the month ends deletes nothing', 'SEP', null,
           $s$select private.manager_can_change_meal('2099-09-20', 'lunch', '2099-10-06 00:00+06')
                 || ' | deposits=' || (select count(*) from public.deposits)
                 || ' guests=' || (select count(*) from public.guest_meals)
                 || ' spending=' || (select count(*) from public.spending_records)$s$,
           'false | deposits=1 guests=1 spending=1'),
      (128, 'No foreign key cascades onto business data', 'postgres', null,
           $s$select coalesce(string_agg(conrelid::regclass || ' -> ' || confrelid::regclass, ', ' order by 1), 'none')
                from pg_constraint
               where contype = 'f' and confdeltype = 'c'
                 and (connamespace = 'public'::regnamespace or confrelid::regclass::text like 'public.%')$s$,
           'employee_accounts -> employees')
    ) as t(n, name, who, setup, sql, expected)
  loop
    v_got := null;
    v_expected := c.expected;

    begin
      -- Fixture months: 2096-2100 and 2000, as register_mess_manager makes them.
      insert into auth.users (id, email, aud, role)
      select md5('mp-manager-' || tag)::uuid, 'zz-mp-' || tag || '@mess-manager.test', 'authenticated', 'authenticated'
        from unnest(v_tags) as tag;
      insert into public.admin_profiles (id, full_name)
      select md5('mp-manager-' || tag)::uuid, 'zz mp ' || tag from unnest(v_tags) as tag;
      insert into public.mess_periods (id, manager_id, start_date, end_date)
      select md5('mp-period-' || tag)::uuid, md5('mp-manager-' || tag)::uuid, s, (s + interval '1 month')::date
        from unnest(v_tags, v_starts) as t(tag, s);

      -- Throwaway employees: E (with a login) ate every meal of 4 Sep,
      -- 5 Sep, 4 Oct, 5 Oct, 6 Oct 2099, 5 Dec 2099 and 5 Jan 2100.
      insert into public.employees (id, name) values
        (v_emp, 'zz manager period check (rolled back)'),
        (v_emp2, 'zz manager period check 2 (rolled back)');
      insert into auth.users (id, email, aud, role)
      values (v_login, 'emp-01999999997@mess-manager.app', 'authenticated', 'authenticated');
      insert into public.employee_accounts (employee_id, phone, user_id) values (v_emp, '01999999997', v_login);
      insert into public.meal_records (employee_id, meal_date, breakfast, lunch, dinner)
      select v_emp, d, true, true, true
        from unnest(array['2099-09-04', '2099-09-05', '2099-10-04', '2099-10-05', '2099-10-06',
                          '2099-12-05', '2100-01-05']::date[]) as d;
      insert into public.meal_records (employee_id, meal_date, lunch) values (v_emp, '2000-01-10', true);

      -- Each month's own meal counts for the boundary dates; the 9.99s are
      -- meals the row's month doesn't own and must never be billed.
      insert into public.meal_day_weights (period_id, meal_date, breakfast_weight, lunch_weight, dinner_weight) values
        (md5('mp-period-aug')::uuid, '2099-09-05', 1.50, 9.99, 9.99),
        (md5('mp-period-sep')::uuid, '2099-09-05', 9.99, 4.00, 1.00),
        (md5('mp-period-sep')::uuid, '2099-10-05', 2.00, 9.99, 9.99),
        (md5('mp-period-oct')::uuid, '2099-10-05', 9.99, 3.00, 1.00);
      insert into public.deposits (period_id, employee_id, amount) values
        (md5('mp-period-sep')::uuid, v_emp, 1000), (md5('mp-period-old')::uuid, v_emp, 500);
      insert into public.guest_meals (period_id, meal_date, breakfast_guests, lunch_guests, dinner_guests) values
        (md5('mp-period-sep')::uuid, '2099-09-20', 5, 10, 15), (md5('mp-period-old')::uuid, '2000-01-10', 1, 1, 1);
      insert into public.spending_records (period_id, spent_on, person_name, amount) values
        (md5('mp-period-sep')::uuid, '2099-09-20', 'Rahim', 3000), (md5('mp-period-old')::uuid, '2000-01-10', 'Karim', 100);

      -- Today's months: the real ones where a manager has signed up,
      -- otherwise throwaway ones.
      v_c := private.get_meal_period(v_today, 'lunch');
      if v_c is null then
        v_c_start := case when extract(day from v_today) >= 5 then date_trunc('month', v_today)::date + 4
                          else (date_trunc('month', v_today) - interval '1 month')::date + 4 end;
        insert into auth.users (id, email, aud, role)
        values (md5('mp-manager-today-c')::uuid, 'zz-mp-today-c@mess-manager.test', 'authenticated', 'authenticated');
        insert into public.admin_profiles (id, full_name) values (md5('mp-manager-today-c')::uuid, 'zz mp today-c');
        insert into public.mess_periods (manager_id, start_date, end_date)
        values (md5('mp-manager-today-c')::uuid, v_c_start, (v_c_start + interval '1 month')::date)
        returning id into v_c;
      end if;
      select start_date, end_date into v_c_start, v_c_end from public.mess_periods where id = v_c;

      v_p := private.get_meal_period(v_c_start, 'breakfast');
      if v_p is null then
        insert into auth.users (id, email, aud, role)
        values (md5('mp-manager-today-p')::uuid, 'zz-mp-today-p@mess-manager.test', 'authenticated', 'authenticated');
        insert into public.admin_profiles (id, full_name) values (md5('mp-manager-today-p')::uuid, 'zz mp today-p');
        insert into public.mess_periods (manager_id, start_date, end_date)
        values (md5('mp-manager-today-p')::uuid, (v_c_start - interval '1 month')::date, v_c_start)
        returning id into v_p;
      end if;

      v_n := private.get_meal_period(v_c_end, 'lunch');
      if v_n is null then
        insert into auth.users (id, email, aud, role)
        values (md5('mp-manager-today-n')::uuid, 'zz-mp-today-n@mess-manager.test', 'authenticated', 'authenticated');
        insert into public.admin_profiles (id, full_name) values (md5('mp-manager-today-n')::uuid, 'zz mp today-n');
        insert into public.mess_periods (manager_id, start_date, end_date)
        values (md5('mp-manager-today-n')::uuid, v_c_end, (v_c_end + interval '1 month')::date)
        returning id into v_n;
      end if;

      -- E ate everything on the day before the month, its first and its
      -- last day; E2 has lunch and dinner today.
      insert into public.meal_records (employee_id, meal_date, breakfast, lunch, dinner)
      values (v_emp, v_c_start - 1, true, true, true), (v_emp, v_c_start, true, true, true),
             (v_emp, v_c_end, true, true, true)
      on conflict (employee_id, meal_date) do nothing;
      insert into public.meal_records (employee_id, meal_date, breakfast, lunch, dinner)
      values (v_emp2, v_today, false, true, true);

      v_keys := array['T', 'C_START', 'C_END', 'E', 'E2', 'C', 'P', 'N', 'BF_OWNER', 'AUG', 'SEP', 'OCT', 'OLD'];
      v_vals := array[
        quote_literal(v_today), quote_literal(v_c_start), quote_literal(v_c_end),
        quote_literal(v_emp), quote_literal(v_emp2),
        quote_literal(v_c), quote_literal(v_p), quote_literal(v_n),
        quote_literal(private.get_meal_period(v_today, 'breakfast')),
        quote_literal(md5('mp-period-aug')::uuid), quote_literal(md5('mp-period-sep')::uuid),
        quote_literal(md5('mp-period-oct')::uuid), quote_literal(md5('mp-period-old')::uuid)];

      v_expected := case c.expected
        when 'ALLOW_ON_HANDOVER' then case when v_today = v_c_start then 'ALLOW' else 'REJECT' end
        when 'STATUS_P' then case when v_today = v_c_start then 'active' else 'completed' end
        else c.expected end;

      if c.setup is not null then
        foreach v_stmt in array c.setup loop
          for i in 1 .. array_length(v_keys, 1) loop
            v_stmt := replace(v_stmt, '{' || v_keys[i] || '}', v_vals[i]);
          end loop;
          execute v_stmt;
        end loop;
      end if;

      v_stmt := c.sql;
      for i in 1 .. array_length(v_keys, 1) loop
        v_stmt := replace(v_stmt, '{' || v_keys[i] || '}', v_vals[i]);
      end loop;

      if c.who = 'anon' then
        set local role anon;
      elsif c.who <> 'postgres' then
        v_who := case c.who
          when 'C' then (select manager_id from public.mess_periods where id = v_c)
          when 'P' then (select manager_id from public.mess_periods where id = v_p)
          when 'N' then (select manager_id from public.mess_periods where id = v_n)
          when 'EMP' then v_login
          else md5('mp-manager-' || lower(c.who))::uuid
        end;
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;

      execute v_stmt into v_got;
      raise exception using errcode = 'P0T01', message = coalesce(v_got, 'ALLOW');
    exception when others then
      -- Everything above, fixtures included, is rolled back here.
      v_got := case when sqlstate = 'P0T01' then sqlerrm else 'REJECT: ' || sqlerrm end;
    end;

    check_no := c.n;
    check_name := c.name;
    expected := v_expected;
    got := v_got;
    result := case when got = expected or split_part(got, ':', 1) = expected then 'PASS' else 'FAIL' end;
    return next;
  end loop;
end;
$$;

select * from pg_temp.manager_periods_check() order by check_no;
