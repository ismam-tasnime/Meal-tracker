-- Checks that the egg columns (migration 0019) left the meal bill exactly as
-- it was, including on the handover days. Paste into the Supabase SQL editor
-- and Run; one row per check, every row should say PASS.
--
-- Checks 90-99 are the bill checks of manager_periods_check.sql, with the
-- same fixtures and the same expected values, re-run against the versions of
-- get_period_report() / get_my_statement() / get_dashboard_stats() that carry
-- the egg columns. Checks 100-104 then add eggs on top and expect those meal
-- numbers not to budge.
--
-- Safe on the live project: changes nothing. Each check runs in its own
-- sub-transaction that is always rolled back, fixtures included. The fixture
-- months are in 2099-2100 and the employee's token is 990201, so they can
-- never overlap a real month or employee.
--
-- The fixture: August, September and October 2099, each with its own manager,
-- and one employee who ate every meal of 4 Sep, 5 Sep, 4 Oct, 5 Oct, 6 Oct
-- 2099, 5 Dec 2099 and 5 Jan 2100, with a 1,000 deposit in September. The
-- boundary dates carry each month's own meal counts, where the 9.99s are
-- meals that row's month does not own: if a bill ever priced a meal from the
-- wrong month's row, it would bill a 9.99 and these checks would fail.

create or replace function pg_temp.egg_bill_boundary_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $outer$
declare
  c record;
  v_got text;
begin
  check_no := 0;
  check_name := 'Migration 0019 installed (egg columns on the bills)';
  expected := 'yes';
  got := case when to_regclass('public.egg_records') is not null
               and exists (select 1 from information_schema.routines r
                            join information_schema.parameters p
                              on p.specific_name = r.specific_name
                           where r.routine_schema = 'public'
                             and r.routine_name = 'get_period_report'
                             and p.parameter_name = 'final_bill')
              then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, who, sql, expected
      (90, 'August bill: 4 Sep + 5 Sep breakfast (with August''s 5 Sep count)', 'AUG',
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report(md5('bg-aug')::uuid) where employee_id = md5('bg-e')::uuid$s$,
           '2/1/1 4.50'),
      (91, 'September bill: 5 Sep lunch+dinner, 4 Oct, 5 Oct breakfast', 'SEP',
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report(md5('bg-sep')::uuid) where employee_id = md5('bg-e')::uuid$s$,
           '2/2/2 10.00'),
      (92, 'October bill: 5 Oct lunch+dinner, 6 Oct', 'OCT',
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report(md5('bg-oct')::uuid) where employee_id = md5('bg-e')::uuid$s$,
           '1/2/2 7.00'),
      (93, 'Every meal billed exactly once across the three months', 'postgres',
           $s$select sum(breakfast_count + lunch_count + dinner_count) || ' of 15'
                from (select * from public.get_period_report(md5('bg-aug')::uuid)
                      union all select * from public.get_period_report(md5('bg-sep')::uuid)
                      union all select * from public.get_period_report(md5('bg-oct')::uuid)) r
               where r.employee_id = md5('bg-e')::uuid$s$,
           '15 of 15'),
      (94, 'Employee''s own September bill matches the manager''s', 'EMP',
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_my_statement('2099-09-05')$s$,
           '2/2/2 10.00'),
      (95, 'Employee''s September days: 5 Sep without breakfast, 5 Oct breakfast only', 'EMP',
           $s$select string_agg(to_char(meal_date, 'MM-DD') || ' ' || breakfast::int || lunch::int || dinner::int, ', ' order by meal_date)
                from public.get_my_meal_days('2099-09-05')$s$,
           '09-05 011, 10-04 111, 10-05 100'),
      (96, 'A month nobody manages yet uses the same bounds', 'EMP',
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_my_statement('2099-12-05')$s$,
           '1/1/1 3.00'),
      (97, 'Dashboard total for September matches its bill', 'SEP',
           $s$select meal_count::text from public.get_dashboard_stats(md5('bg-sep')::uuid, '2099-09-20')$s$,
           '10.00'),
      (98, 'September''s dashboard on 5 Oct: today''s breakfast only', 'SEP',
           $s$select concat_ws('/', today_in_period, coalesce(today_breakfast::text, '-'), coalesce(today_lunch::text, '-'), coalesce(today_dinner::text, '-'))
                from public.get_dashboard_stats(md5('bg-sep')::uuid, '2099-10-05')$s$,
           't/1/-/-'),
      (99, 'October''s dashboard on 5 Oct: today''s lunch and dinner only', 'OCT',
           $s$select concat_ws('/', today_in_period, coalesce(today_breakfast::text, '-'), coalesce(today_lunch::text, '-'), coalesce(today_dinner::text, '-'))
                from public.get_dashboard_stats(md5('bg-oct')::uuid, '2099-10-05')$s$,
           't/-/1/1'),

      -- With 3 eggs at 15 recorded in September ---------------------------
      (100, 'Eggs leave September''s meal numbers exactly as they were', 'SEP',
           $s$select breakfast_count || '/' || lunch_count || '/' || dinner_count || ' ' || meal_count
                from public.get_period_report(md5('bg-sep')::uuid) where employee_id = md5('bg-e')::uuid$s$,
           '2/2/2 10.00'),
      (101, 'September with a rate: meal 600, eggs 45, final 645, balance 355', 'SEP',
           $s$select total_bill::text || ' / ' || egg_total::text || ' / ' || final_bill::text || ' / ' || balance::text
                from public.get_period_report(md5('bg-sep')::uuid) where employee_id = md5('bg-e')::uuid$s$,
           '600.00 / 45.00 / 645.00 / 355.00'),
      (102, 'October''s bill never sees September''s eggs', 'OCT',
           $s$select egg_count || ' / ' || egg_total::text
                from public.get_period_report(md5('bg-oct')::uuid) where employee_id = md5('bg-e')::uuid$s$,
           '0 / 0'),
      (103, 'The employee''s own September statement agrees, meals and eggs', 'EMP',
           $s$select meal_count::text || ' / ' || total_bill::text || ' / ' || egg_total::text || ' / ' || final_bill::text || ' / ' || balance::text
                from public.get_my_statement('2099-09-05')$s$,
           '10.00 / 600.00 / 45.00 / 645.00 / 355.00'),
      (104, 'September''s dashboard: egg charges, meal bill, and nothing due', 'SEP',
           $s$select egg_total::text || ' / ' || total_bill::text || ' / ' || total_due::text
                from public.get_dashboard_stats(md5('bg-sep')::uuid, '2099-09-20')$s$,
           '45.00 / 600.00 / 0')
    ) as t(n, name, who, sql, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;

    begin
      insert into auth.users (id, email, aud, role) values
        (md5('bg-mgr-aug')::uuid, 'mess-2099-08@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('bg-mgr-sep')::uuid, 'mess-2099-09@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('bg-mgr-oct')::uuid, 'mess-2099-10@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('bg-login-e')::uuid, 'emp-id-bgtest@mess-manager.app', 'authenticated', 'authenticated');
      insert into public.admin_profiles (id, full_name) values
        (md5('bg-mgr-aug')::uuid, 'zz bg aug'),
        (md5('bg-mgr-sep')::uuid, 'zz bg sep'),
        (md5('bg-mgr-oct')::uuid, 'zz bg oct');
      insert into public.mess_periods (id, manager_id, start_date, end_date) values
        (md5('bg-aug')::uuid, md5('bg-mgr-aug')::uuid, '2099-08-05', '2099-09-05'),
        (md5('bg-sep')::uuid, md5('bg-mgr-sep')::uuid, '2099-09-05', '2099-10-05'),
        (md5('bg-oct')::uuid, md5('bg-mgr-oct')::uuid, '2099-10-05', '2099-11-05');
      insert into public.employees (id, name, token_no, is_active) values
        (md5('bg-e')::uuid, 'zz egg bill check (rolled back)', 990201, true);
      insert into public.employee_accounts (employee_id, employee_code, user_id) values
        (md5('bg-e')::uuid, 'bgtest', md5('bg-login-e')::uuid);
      insert into public.meal_records (employee_id, meal_date, breakfast, lunch, dinner)
      select md5('bg-e')::uuid, d, true, true, true
        from unnest(array['2099-09-04', '2099-09-05', '2099-10-04', '2099-10-05', '2099-10-06',
                          '2099-12-05', '2100-01-05']::date[]) as d;
      insert into public.meal_day_weights (period_id, meal_date, breakfast_weight, lunch_weight, dinner_weight) values
        (md5('bg-aug')::uuid, '2099-09-05', 1.50, 9.99, 9.99),
        (md5('bg-sep')::uuid, '2099-09-05', 9.99, 4.00, 1.00),
        (md5('bg-sep')::uuid, '2099-10-05', 2.00, 9.99, 9.99),
        (md5('bg-oct')::uuid, '2099-10-05', 9.99, 3.00, 1.00);
      insert into public.deposits (period_id, employee_id, amount) values
        (md5('bg-sep')::uuid, md5('bg-e')::uuid, 1000);

      if c.n >= 100 then
        insert into public.egg_records (period_id, employee_id, meal_date, egg_qty, egg_price) values
          (md5('bg-sep')::uuid, md5('bg-e')::uuid, '2099-09-20', 2, 15),
          (md5('bg-sep')::uuid, md5('bg-e')::uuid, '2099-09-21', 1, 15);
      end if;
      if c.n >= 101 then
        update public.mess_periods set meal_rate = 60, published_meal_rate = 60
         where id = md5('bg-sep')::uuid;
      end if;

      if c.who <> 'postgres' then
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case c.who when 'AUG' then md5('bg-mgr-aug')::uuid
                            when 'SEP' then md5('bg-mgr-sep')::uuid
                            when 'OCT' then md5('bg-mgr-oct')::uuid
                            else md5('bg-login-e')::uuid end,
          'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;

      execute c.sql into v_got;
      raise exception using errcode = 'P0T01', message = coalesce(v_got, 'NULL');
    exception when others then
      v_got := case when sqlstate = 'P0T01' then sqlerrm else 'ERROR: ' || sqlerrm end;
    end;

    got := v_got;
    result := case when got = expected then 'PASS' else 'FAIL' end;
    return next;
  end loop;
end;
$outer$;

select * from pg_temp.egg_bill_boundary_check() order by check_no;
