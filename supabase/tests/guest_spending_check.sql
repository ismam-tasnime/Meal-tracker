-- Checks guest meals and spending (migration 0014) in the database: who can
-- read and change them, one guest record per date + meal, any number of
-- spending entries per date, months kept apart, and the month's spending
-- total. Paste into the Supabase SQL editor and Run; one row per check,
-- every row should say PASS.
--
-- Safe on the live project: changes nothing. Like meal_cutoffs_check.sql,
-- each check runs in its own sub-transaction that is always rolled back,
-- including the throwaway mess months it sets up (in 2099, so they can't
-- overlap a real month), their manager logins, and the test employee.
--
-- Who's asking, like the app: "manager A" owns January 2099 (5 Jan – 4 Feb),
-- "manager B" owns February 2099, "employee" is a signed-in employee login
-- — all three as `authenticated` with their own login id — and "anon" is
-- signed out, which is how the cook's meal board reads.

create or replace function pg_temp.guest_spending_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_mgr_a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_mgr_b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_mgr_today constant uuid := 'c0000000-0000-4000-8000-00000000000c';
  v_emp_login constant uuid := 'e0000000-0000-4000-8000-00000000000e';
  v_emp constant uuid := 'e1000000-0000-4000-8000-00000000000e';
  v_today_period uuid;
  v_today_bf_period uuid;
  c record;
  v_stmt text;
  v_got text;
begin
  check_no := 0;
  check_name := 'Migration 0014 installed (guest_meals, spending_records)';
  expected := 'yes';
  got := case when to_regclass('public.guest_meals') is not null
               and to_regclass('public.spending_records') is not null then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, who, setup (run first, as the SQL editor), sql (run as `who`), expected.
      -- Month A = a1000000-…, month B = b1000000-…; $1 = today (Asia/Dhaka), $2 = the month owning
      -- today's lunch, $3 = the month owning today's breakfast (on the 5th they differ).

      -- Guest meals ---------------------------------------------------------
      (1, 'Manager saves 1 breakfast guest', 'manager A', null::text[],
          $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 1, 0, 0)
             on conflict (period_id, meal_date) do update set
               breakfast_guests = excluded.breakfast_guests, lunch_guests = excluded.lunch_guests,
               dinner_guests = excluded.dinner_guests
             returning format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests)$s$, '1/0/0'),
      (2, 'Manager saves 100 lunch guests', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 0, 100, 0)
             returning format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests)$s$, '0/100/0'),
      (3, 'Manager saves 150 dinner guests', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 0, 0, 150)
             returning format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests)$s$, '0/0/150'),
      (4, 'Breakfast, lunch and dinner guests on one date', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 20, 100, 50)
             returning format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests)$s$, '20/100/50'),
      (5, 'A second guest record for the same date is refused', 'manager A',
          array[$s$insert into public.guest_meals (meal_date, period_id, breakfast_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 20)$s$],
          $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 100) returning 'ALLOW'$s$, 'REJECT'),
      (6, 'Editing a date''s guests overwrites its one record', 'manager A',
          array[$s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 20, 100, 50)$s$],
          $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 25, 120, 50)
             on conflict (period_id, meal_date) do update set
               breakfast_guests = excluded.breakfast_guests, lunch_guests = excluded.lunch_guests,
               dinner_guests = excluded.dinner_guests
             returning format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests)$s$, '25/120/50'),
      (7, 'Manager removes a date''s guests', 'manager A',
          array[$s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 100)$s$],
          $s$with d as (delete from public.guest_meals where meal_date = '2099-01-10' returning 1)
             select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from d$s$, 'ALLOW'),
      (8, 'Negative guest count refused', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', -1) returning 'ALLOW'$s$, 'REJECT'),
      (9, 'More than 10,000 guests for one meal refused', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 10001) returning 'ALLOW'$s$, 'REJECT'),
      (10, 'Guests on a date outside the manager''s month refused', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
             values ('2099-02-10', 'a1000000-0000-4000-8000-00000000000a', 5) returning 'ALLOW'$s$, 'REJECT'),
      (11, 'Guests filed under another manager''s month refused', 'manager A', null,
          $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
             values ('2099-02-10', 'b1000000-0000-4000-8000-00000000000b', 5) returning 'ALLOW'$s$, 'REJECT'),
      (12, 'Other month''s manager can''t see these guests', 'manager B',
          array[$s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 100)$s$],
          $s$select count(*)::text from public.guest_meals$s$, '0'),
      (13, 'Other month''s manager can''t change these guests', 'manager B',
          array[$s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 100)$s$],
          $s$with u as (update public.guest_meals set lunch_guests = 1 where meal_date = '2099-01-10' returning 1)
             select case when count(*) = 0 then 'REJECT: no rows changed' else 'ALLOW' end from u$s$, 'REJECT'),
      (14, 'Employee can''t see guest meals', 'employee',
          array[$s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 100)$s$],
          $s$select count(*)::text from public.guest_meals$s$, '0'),
      (15, 'Employee can''t add guest meals', 'employee', null,
          $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
             values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 5) returning 'ALLOW'$s$, 'REJECT'),
      (16, 'Signed out can''t read guest meals', 'anon', null,
          $s$select count(*)::text from public.guest_meals$s$, 'REJECT'),
      (17, 'Cook''s board gets today''s guest counts', 'anon',
          array[$s$insert into public.guest_meals (meal_date, period_id, lunch_guests, dinner_guests)
                   values ($1, $2, 8, 9)
                   on conflict (period_id, meal_date) do update set lunch_guests = 8, dinner_guests = 9$s$,
                 $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests)
                   values ($1, $3, 7)
                   on conflict (period_id, meal_date) do update set breakfast_guests = 7$s$],
          $s$select format('%s/%s/%s', breakfast_guests, lunch_guests, dinner_guests)
             from public.get_today_guest_meals()$s$, '7/8/9'),
      (18, 'Cook''s board gets no other date', 'anon',
          array[$s$insert into public.guest_meals (meal_date, period_id, breakfast_guests)
                   values ($1, $3, 7) on conflict (period_id, meal_date) do update set breakfast_guests = 7$s$,
                $s$insert into public.guest_meals (meal_date, period_id, lunch_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 100)$s$],
          $s$select count(*)::text from public.get_today_guest_meals()$s$, '1'),
      (19, 'Guests don''t change employee meal counts or bills', 'manager A',
          array[$s$insert into public.meal_records (employee_id, meal_date, breakfast, lunch, dinner)
                   values ('e1000000-0000-4000-8000-00000000000e', '2099-01-10', true, true, false)$s$,
                $s$insert into public.guest_meals (meal_date, period_id, breakfast_guests, lunch_guests, dinner_guests)
                   values ('2099-01-10', 'a1000000-0000-4000-8000-00000000000a', 20, 100, 50)$s$],
          $s$select format('%s meals, meal count %s', sum(breakfast_count + lunch_count + dinner_count), sum(meal_count))
             from public.get_period_report('a1000000-0000-4000-8000-00000000000a')$s$, '2 meals, meal count 2.00'),

      -- Spending ------------------------------------------------------------
      (21, 'Manager records a spending', 'manager A', null,
          $s$insert into public.spending_records (period_id, spent_on, person_name, amount)
             values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3500)
             returning format('%s %s', person_name, amount)$s$, 'Rahim 3500.00'),
      (22, 'Several spendings on the same date', 'manager A', null,
          $s$with ins as (
               insert into public.spending_records (period_id, spent_on, person_name, amount) values
                 ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000),
                 ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Karim', 2500),
                 ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 1200)
               returning 1)
             select count(*)::text from ins$s$, '3'),
      (23, 'Spendings across different dates', 'manager A', null,
          $s$with ins as (
               insert into public.spending_records (period_id, spent_on, person_name, amount) values
                 ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000),
                 ('a1000000-0000-4000-8000-00000000000a', '2099-01-29', 'Karim', 4000)
               returning spent_on)
             select count(distinct spent_on)::text from ins$s$, '2'),
      (24, 'Monthly total adds up every entry (Sum Spending)', 'manager A',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount) values
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000),
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Karim', 2500),
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 1200),
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-29', 'Karim', 4000)$s$],
          $s$select format('%s entries, %s', entry_count, total_amount)
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, '4 entries, 10700.00'),
      (25, 'Months don''t mix in the total', 'manager A',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount) values
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000),
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Karim', 2500),
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 1200),
                   ('a1000000-0000-4000-8000-00000000000a', '2099-01-29', 'Karim', 4000),
                   ('b1000000-0000-4000-8000-00000000000b', '2099-02-10', 'Other', 9999)$s$],
          $s$select format('%s entries, %s', entry_count, total_amount)
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, '4 entries, 10700.00'),
      (26, 'Spending dated after the month''s last day refused', 'manager A', null,
          $s$insert into public.spending_records (period_id, spent_on, person_name, amount)
             values ('a1000000-0000-4000-8000-00000000000a', '2099-02-06', 'Rahim', 100) returning 'ALLOW'$s$, 'REJECT'),
      (27, 'Manager edits a spending', 'manager A',
          array[$s$insert into public.spending_records (id, period_id, spent_on, person_name, amount) values
                   ('51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$update public.spending_records set person_name = 'Rahim Uddin', amount = 3500, spent_on = '2099-01-29'
             where id = '51000000-0000-4000-8000-000000000001'
             returning format('%s %s %s', spent_on, person_name, amount)$s$, '2099-01-29 Rahim Uddin 3500.00'),
      (28, 'Total follows an edited entry', 'manager A',
          array[$s$insert into public.spending_records (id, period_id, spent_on, person_name, amount) values
                   ('51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000),
                   ('51000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Karim', 2500),
                   ('51000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 1200),
                   ('51000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-00000000000a', '2099-01-29', 'Karim', 4000)$s$,
                $s$update public.spending_records set amount = 3500 where id = '51000000-0000-4000-8000-000000000001'$s$],
          $s$select format('%s entries, %s', entry_count, total_amount)
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, '4 entries, 11200.00'),
      (29, 'Manager deletes a spending', 'manager A',
          array[$s$insert into public.spending_records (id, period_id, spent_on, person_name, amount) values
                   ('51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$with d as (delete from public.spending_records where id = '51000000-0000-4000-8000-000000000001' returning 1)
             select case when count(*) = 1 then 'ALLOW' else 'REJECT: no rows changed' end from d$s$, 'ALLOW'),
      (30, 'Total follows a deleted entry', 'manager A',
          array[$s$insert into public.spending_records (id, period_id, spent_on, person_name, amount) values
                   ('51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000),
                   ('51000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Karim', 2500),
                   ('51000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 1200),
                   ('51000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-00000000000a', '2099-01-29', 'Karim', 4000)$s$,
                $s$delete from public.spending_records where id = '51000000-0000-4000-8000-000000000003'$s$],
          $s$select format('%s entries, %s', entry_count, total_amount)
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, '3 entries, 9500.00'),
      (31, 'Zero amount refused', 'manager A', null,
          $s$insert into public.spending_records (period_id, spent_on, person_name, amount)
             values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 0) returning 'ALLOW'$s$, 'REJECT'),
      (32, 'Negative amount refused', 'manager A', null,
          $s$insert into public.spending_records (period_id, spent_on, person_name, amount)
             values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', -50) returning 'ALLOW'$s$, 'REJECT'),
      (33, 'Blank name refused', 'manager A', null,
          $s$insert into public.spending_records (period_id, spent_on, person_name, amount)
             values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', '   ', 100) returning 'ALLOW'$s$, 'REJECT'),
      (34, 'A spending can''t be moved to another month', 'manager A',
          array[$s$insert into public.spending_records (id, period_id, spent_on, person_name, amount) values
                   ('51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$update public.spending_records set period_id = 'b1000000-0000-4000-8000-00000000000b'
             where id = '51000000-0000-4000-8000-000000000001' returning 'ALLOW'$s$, 'REJECT'),
      (35, 'Other month''s manager can''t see these spendings', 'manager B',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount)
                   values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$select count(*)::text from public.spending_records$s$, '0'),
      (36, 'Other month''s manager can''t change these spendings', 'manager B',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount)
                   values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$with u as (update public.spending_records set amount = 1 returning 1)
             select case when count(*) = 0 then 'REJECT: no rows changed' else 'ALLOW' end from u$s$, 'REJECT'),
      (37, 'Other month''s manager can''t delete these spendings', 'manager B',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount)
                   values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$with d as (delete from public.spending_records returning 1)
             select case when count(*) = 0 then 'REJECT: no rows changed' else 'ALLOW' end from d$s$, 'REJECT'),
      (38, 'Other month''s manager can''t total this month', 'manager B',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount)
                   values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$select format('%s entries, %s', entry_count, total_amount)
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, '0 entries, 0'),
      (39, 'Employee can''t see spendings', 'employee',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount)
                   values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$select count(*)::text from public.spending_records$s$, '0'),
      (40, 'Employee can''t add a spending', 'employee', null,
          $s$insert into public.spending_records (period_id, spent_on, person_name, amount)
             values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000) returning 'ALLOW'$s$, 'REJECT'),
      (41, 'Employee can''t total spendings', 'employee',
          array[$s$insert into public.spending_records (period_id, spent_on, person_name, amount)
                   values ('a1000000-0000-4000-8000-00000000000a', '2099-01-28', 'Rahim', 3000)$s$],
          $s$select format('%s entries, %s', entry_count, total_amount)
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, '0 entries, 0'),
      (42, 'Signed out can''t read spendings', 'anon', null,
          $s$select count(*)::text from public.spending_records$s$, 'REJECT'),
      (43, 'Signed out can''t total spendings', 'anon', null,
          $s$select total_amount::text
             from public.get_spending_total('a1000000-0000-4000-8000-00000000000a')$s$, 'REJECT')
    ) as t(n, name, who, setup, sql, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;

    begin
      -- Fixtures: two throwaway mess months and their managers, and an
      -- employee with a login. Rolled back with everything else below.
      insert into auth.users (id, email, aud, role) values
        (v_mgr_a, 'zz-guest-check-a@mess-manager.test', 'authenticated', 'authenticated'),
        (v_mgr_b, 'zz-guest-check-b@mess-manager.test', 'authenticated', 'authenticated'),
        (v_emp_login, 'emp-01999999998@mess-manager.app', 'authenticated', 'authenticated');
      insert into public.admin_profiles (id, full_name) values
        (v_mgr_a, 'zz guest check A (rolled back)'),
        (v_mgr_b, 'zz guest check B (rolled back)');
      insert into public.mess_periods (id, manager_id, start_date, end_date) values
        ('a1000000-0000-4000-8000-00000000000a', v_mgr_a, '2099-01-05', '2099-02-05'),
        ('b1000000-0000-4000-8000-00000000000b', v_mgr_b, '2099-02-05', '2099-03-05');
      insert into public.employees (id, name) values (v_emp, 'zz guest check employee (rolled back)');
      insert into public.employee_accounts (employee_id, phone, user_id)
      values (v_emp, '01999999998', v_emp_login);

      -- Today's months, for the cook's board: whoever owns today's lunch and
      -- today's breakfast (on the 5th, two months; migration 0015). The real
      -- ones if a manager has signed up for them, otherwise throwaway ones.
      v_today_period := private.get_meal_period(v_today, 'lunch');
      if v_today_period is null then
        insert into auth.users (id, email, aud, role)
        values (v_mgr_today, 'zz-guest-check-today@mess-manager.test', 'authenticated', 'authenticated');
        insert into public.admin_profiles (id, full_name) values (v_mgr_today, 'zz guest check today');
        insert into public.mess_periods (manager_id, start_date, end_date)
        values (v_mgr_today, v_today, v_today + 1)
        returning id into v_today_period;
      end if;
      v_today_bf_period := private.get_meal_period(v_today, 'breakfast');
      if v_today_bf_period is null then
        insert into auth.users (id, email, aud, role)
        values (md5('zz-guest-check-today-bf')::uuid, 'zz-guest-check-today-bf@mess-manager.test', 'authenticated', 'authenticated');
        insert into public.admin_profiles (id, full_name) values (md5('zz-guest-check-today-bf')::uuid, 'zz guest check today bf');
        insert into public.mess_periods (manager_id, start_date, start_meal, end_date, end_meal)
        values (md5('zz-guest-check-today-bf')::uuid, v_today - 1, 'dinner', v_today, 'breakfast')
        returning id into v_today_bf_period;
      end if;

      if c.setup is not null then
        foreach v_stmt in array c.setup loop
          execute v_stmt using v_today, v_today_period, v_today_bf_period;
        end loop;
      end if;

      if c.who = 'anon' then
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case c.who when 'manager A' then v_mgr_a
                            when 'manager B' then v_mgr_b
                            else v_emp_login end,
          'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;

      execute c.sql into v_got using v_today, v_today_period, v_today_bf_period;
      raise exception using errcode = 'P0T01', message = coalesce(v_got, 'ALLOW');
    exception when others then
      -- Everything above, fixtures included, is rolled back here.
      v_got := case when sqlstate = 'P0T01' then sqlerrm else 'REJECT: ' || sqlerrm end;
    end;

    got := v_got;
    result := case when got = c.expected or split_part(got, ':', 1) = c.expected
                   then 'PASS' else 'FAIL' end;
    return next;
  end loop;
end;
$$;

select * from pg_temp.guest_spending_check() order by check_no;
