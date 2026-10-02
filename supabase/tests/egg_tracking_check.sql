-- Checks egg tracking and egg billing (migration 0019). Paste into the
-- Supabase SQL editor and Run; one row per check, every row should say PASS.
--
-- Safe on the live project: changes nothing. Each check runs in its own
-- sub-transaction that is always rolled back, fixtures included. The
-- fixtures live in 2099 and use tokens 990101-990102, so they can never
-- overlap a real mess month or employee.
--
-- The fixture month: 5 Jan 2099 lunch -> 5 Feb 2099 breakfast, managed by
-- one account, with a second manager for 5 Feb -> 5 Mar 2099.
--   Employee 1 (token 990101): 4 lunches (meal count 4 x 1.25 = 5.00),
--     a 500 deposit, 2 eggs on 10 Jan and 1 egg on 11 Jan at 15 each
--     (egg cost 45), and 5 eggs in February's month at 20 each.
--   Employee 2 (token 990102): nothing at all.
-- So with a meal rate of 60: meal cost 300, egg cost 45, final bill 345,
-- balance 500 - 345 = 155.

create or replace function pg_temp.egg_tracking_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $outer$
declare
  c record;
  v_got text;
begin
  check_no := 0;
  check_name := 'Migration 0019 installed (egg tracking)';
  expected := 'yes';
  got := case when to_regclass('public.egg_records') is not null
               and to_regprocedure('public.get_my_egg_days(date)') is not null
               and exists (select 1 from information_schema.columns
                            where table_schema = 'public'
                              and table_name = 'mess_periods'
                              and column_name = 'egg_price')
              then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, who, sql, expected
      (1, 'An egg charge is quantity x price per egg', 'postgres',
          $s$select egg_total::text from public.egg_records
              where employee_id = md5('egg-e1')::uuid and meal_date = date '2099-01-10'$s$,
          '30.00'),
      (2, 'With no meal rate yet, the egg cost shows but there is no final bill', 'manager',
          $s$select coalesce(total_bill::text, 'null') || ' / ' || egg_total::text || ' / ' || coalesce(final_bill::text, 'null')
               from public.get_period_report(md5('egg-period')::uuid) where employee_id = md5('egg-e1')::uuid$s$,
          'null / 45.00 / null'),
      (3, 'With the meal rate set, the final bill is meal cost + egg cost', 'manager',
          $s$update public.mess_periods set meal_rate = 60 where id = md5('egg-period')::uuid;
             select total_bill::text || ' / ' || egg_total::text || ' / ' || final_bill::text || ' / ' || balance::text
               from public.get_period_report(md5('egg-period')::uuid) where employee_id = md5('egg-e1')::uuid$s$,
          '300.00 / 45.00 / 345.00 / 155.00'),
      (4, 'Eggs never change the meal count or any meal''s status', 'manager',
          $s$select meal_count::text || ' / ' || breakfast_count || '/' || lunch_count || '/' || dinner_count
               from public.get_period_report(md5('egg-period')::uuid) where employee_id = md5('egg-e1')::uuid$s$,
          '5.00 / 0/4/0'),
      (5, 'Recording eggs again for the same date can''t charge twice', 'manager',
          $s$insert into public.egg_records (period_id, employee_id, meal_date, egg_qty, egg_price)
             values (md5('egg-period')::uuid, md5('egg-e1')::uuid, date '2099-01-10', 3, 15)
             on conflict (period_id, employee_id, meal_date)
             do update set egg_qty = excluded.egg_qty, egg_price = excluded.egg_price;
             select count(*) || ' / ' || sum(egg_qty) from public.egg_records
               where employee_id = md5('egg-e1')::uuid and period_id = md5('egg-period')::uuid$s$,
          '2 / 4'),
      (6, 'A date outside the manager''s own month is refused', 'manager',
          $s$insert into public.egg_records (period_id, employee_id, meal_date, egg_qty, egg_price)
             values (md5('egg-period')::uuid, md5('egg-e1')::uuid, date '2099-03-01', 1, 15) returning 'ALLOW'$s$,
          'REJECT'),
      (7, 'Another month''s eggs are not this manager''s to record', 'manager',
          $s$insert into public.egg_records (period_id, employee_id, meal_date, egg_qty, egg_price)
             values (md5('egg-period2')::uuid, md5('egg-e1')::uuid, date '2099-02-11', 1, 15) returning 'ALLOW'$s$,
          'REJECT'),
      (8, 'Each month keeps its own eggs (February''s never reach January)', 'manager2',
          $s$select egg_count || ' / ' || egg_total::text
               from public.get_period_report(md5('egg-period2')::uuid) where employee_id = md5('egg-e1')::uuid$s$,
          '5 / 100.00'),
      (9, 'An employee can read their own egg records', 'employee1',
          $s$select count(*)::text from public.egg_records$s$, '3'),
      (10, 'An employee can read nobody else''s', 'employee2',
          $s$select count(*)::text from public.egg_records$s$, '0'),
      (11, 'An employee can''t record eggs', 'employee1',
          $s$insert into public.egg_records (period_id, employee_id, meal_date, egg_qty, egg_price)
             values (md5('egg-period')::uuid, md5('egg-e1')::uuid, date '2099-01-14', 1, 1) returning 'ALLOW'$s$,
          'REJECT'),
      (12, 'An employee can''t change an egg quantity or price', 'employee1',
          $s$update public.egg_records set egg_qty = 99, egg_price = 1
              where employee_id = md5('egg-e1')::uuid and meal_date = date '2099-01-10';
             select egg_qty || ' / ' || egg_price::text from public.egg_records
               where employee_id = md5('egg-e1')::uuid and meal_date = date '2099-01-10'$s$,
          '2 / 15.00'),
      (13, 'An employee can''t delete an egg charge', 'employee1',
          $s$delete from public.egg_records where employee_id = md5('egg-e1')::uuid;
             select count(*)::text from public.egg_records
               where employee_id = md5('egg-e1')::uuid and period_id = md5('egg-period')::uuid$s$,
          '2'),
      (14, 'Signed-out visitors get no egg data at all', 'anon',
          $s$select count(*)::text from public.egg_records$s$, 'REJECT'),
      (15, 'Before the rate is published the employee sees eggs but no bill', 'employee1',
          $s$select coalesce(total_bill::text, 'null') || ' / ' || egg_total::text || ' / ' || coalesce(final_bill::text, 'null')
               from public.get_my_statement(date '2099-01-05')$s$,
          'null / 45.00 / null'),
      (16, 'Once the rate is published the bill is meal cost + egg cost', 'employee1',
          $s$select total_bill::text || ' / ' || egg_total::text || ' / ' || final_bill::text || ' / ' || balance::text
               from public.get_my_statement(date '2099-01-05')$s$,
          '300.00 / 45.00 / 345.00 / 155.00'),
      (17, 'Changing the month''s price never re-prices eggs already recorded', 'manager',
          $s$update public.mess_periods set egg_price = 25 where id = md5('egg-period')::uuid;
             select egg_total::text from public.egg_records
               where employee_id = md5('egg-e1')::uuid and meal_date = date '2099-01-10'$s$,
          '30.00'),
      (18, 'An egg charge can''t be moved to another date', 'manager',
          $s$update public.egg_records set meal_date = date '2099-01-20'
              where employee_id = md5('egg-e1')::uuid and meal_date = date '2099-01-10' returning 'ALLOW'$s$,
          'REJECT'),
      (19, 'The employee''s egg history is their own month, oldest first', 'employee1',
          $s$select string_agg(meal_date::text || '=' || egg_qty, ',' order by meal_date)
               from public.get_my_egg_days(date '2099-01-05')$s$,
          '2099-01-10=2,2099-01-11=1'),
      (20, 'Setting a quantity to 0 removes the charge entirely', 'manager',
          $s$delete from public.egg_records
              where employee_id = md5('egg-e1')::uuid and meal_date = date '2099-01-10';
             select egg_count || ' / ' || egg_total::text
               from public.get_period_report(md5('egg-period')::uuid) where employee_id = md5('egg-e1')::uuid$s$,
          '1 / 15.00')
    ) as t(n, name, who, sql, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;

    begin
      insert into auth.users (id, email, aud, role) values
        (md5('egg-mgr')::uuid, 'mess-2099-01@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('egg-mgr2')::uuid, 'mess-2099-02@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('egg-login1')::uuid, 'emp-id-eggtest1@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('egg-login2')::uuid, 'emp-id-eggtest2@mess-manager.app', 'authenticated', 'authenticated');
      insert into public.admin_profiles (id, full_name) values
        (md5('egg-mgr')::uuid, 'zz egg manager'),
        (md5('egg-mgr2')::uuid, 'zz egg manager 2');
      insert into public.mess_periods (id, manager_id, start_date, end_date, egg_price) values
        (md5('egg-period')::uuid, md5('egg-mgr')::uuid, date '2099-01-05', date '2099-02-05', 15),
        (md5('egg-period2')::uuid, md5('egg-mgr2')::uuid, date '2099-02-05', date '2099-03-05', 20);
      insert into public.employees (id, name, token_no, is_active) values
        (md5('egg-e1')::uuid, 'zz egg check 1 (rolled back)', 990101, true),
        (md5('egg-e2')::uuid, 'zz egg check 2 (rolled back)', 990102, true);
      insert into public.employee_accounts (employee_id, employee_code, user_id) values
        (md5('egg-e1')::uuid, 'eggtest1', md5('egg-login1')::uuid),
        (md5('egg-e2')::uuid, 'eggtest2', md5('egg-login2')::uuid);
      insert into public.meal_records (employee_id, meal_date, lunch) values
        (md5('egg-e1')::uuid, date '2099-01-10', true),
        (md5('egg-e1')::uuid, date '2099-01-11', true),
        (md5('egg-e1')::uuid, date '2099-01-12', true),
        (md5('egg-e1')::uuid, date '2099-01-13', true);
      insert into public.deposits (period_id, employee_id, amount) values
        (md5('egg-period')::uuid, md5('egg-e1')::uuid, 500);
      insert into public.egg_records (period_id, employee_id, meal_date, egg_qty, egg_price) values
        (md5('egg-period')::uuid, md5('egg-e1')::uuid, date '2099-01-10', 2, 15),
        (md5('egg-period')::uuid, md5('egg-e1')::uuid, date '2099-01-11', 1, 15),
        (md5('egg-period2')::uuid, md5('egg-e1')::uuid, date '2099-02-10', 5, 20);

      -- Only check 16 has a published meal rate; check 15 is the same month
      -- before it was published.
      if c.n = 16 then
        update public.mess_periods
           set meal_rate = 60, published_meal_rate = 60
         where id = md5('egg-period')::uuid;
      end if;

      if c.who = 'anon' then
        set local role anon;
      elsif c.who <> 'postgres' then
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case c.who when 'manager' then md5('egg-mgr')::uuid
                            when 'manager2' then md5('egg-mgr2')::uuid
                            when 'employee1' then md5('egg-login1')::uuid
                            else md5('egg-login2')::uuid end,
          'email', case c.who when 'manager' then 'mess-2099-01@mess-manager.app'
                              when 'manager2' then 'mess-2099-02@mess-manager.app'
                              when 'employee1' then 'emp-id-eggtest1@mess-manager.app'
                              else 'emp-id-eggtest2@mess-manager.app' end,
          'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;

      -- Multi-statement checks: all but the last run first.
      if position(';' in c.sql) > 0 then
        execute split_part(c.sql, ';', 1);
        execute split_part(c.sql, ';', 2) into v_got;
      else
        execute c.sql into v_got;
      end if;
      raise exception using errcode = 'P0T01', message = coalesce(v_got, 'ALLOW');
    exception when others then
      v_got := case when sqlstate = 'P0T01' then sqlerrm else 'REJECT: ' || sqlerrm end;
    end;

    got := v_got;
    result := case when got = expected or split_part(got, ':', 1) = expected
                   then 'PASS' else 'FAIL' end;
    return next;
  end loop;
end;
$outer$;

select * from pg_temp.egg_tracking_check() order by check_no;
