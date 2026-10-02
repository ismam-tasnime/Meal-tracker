-- Checks employee sign-up by Token Number + Employee ID, and sign-in by
-- Employee ID (migration 0018). Paste into the Supabase SQL editor and Run;
-- one row per check, every row should say PASS.
--
-- Safe on the live project: changes nothing. Each check runs in its own
-- sub-transaction that is always rolled back, fixtures included. The test
-- employees use tokens 990011-990013, far above any real token.

create or replace function pg_temp.employee_id_signup_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $$
declare
  c record;
  v_got text;
begin
  check_no := 0;
  check_name := 'Migration 0018 installed (Employee ID sign-up)';
  expected := 'yes';
  got := case when to_regprocedure('public.employee_signup_check(integer,text)') is not null
               and to_regprocedure('public.register_employee_signup(integer,text,text,text)') is not null
               and exists (select 1 from information_schema.columns
                            where table_schema = 'public'
                              and table_name = 'employee_accounts'
                              and column_name = 'employee_code')
              then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, who (login id or 'postgres'), sql, expected
      (1, 'An unknown token can''t sign up', 'anon',
          $s$select public.employee_signup_check(990099, 'EMP-9901')$s$, 'not_found'),
      (2, 'A token on the employee list can, with a free Employee ID', 'anon',
          $s$select public.employee_signup_check(990011, 'EMP-9901')$s$, 'ok'),
      (3, 'A deactivated employee''s token can''t', 'anon',
          $s$select public.employee_signup_check(990013, 'EMP-9903')$s$, 'inactive'),
      (4, 'A token that already signed up is taken', 'anon',
          $s$select public.employee_signup_check(990012, 'EMP-9901')$s$, 'taken'),
      (5, 'An Employee ID another employee uses is refused', 'anon',
          $s$select public.employee_signup_check(990011, 'emp-9902')$s$, 'code_taken'),
      (6, 'An Employee ID with spaces or symbols is refused', 'anon',
          $s$select public.employee_signup_check(990011, 'EMP 99/01')$s$, 'bad_code'),
      (7, 'Signing up links the login, stores the ID and phone, and updates the name', 'new-login',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '01799990011', 'EMP-9901');
             select (select count(*) from public.employee_accounts a where a.user_id = auth.uid())
                    || ' / ' || (select a.employee_code || ' / ' || a.phone from public.employee_accounts a where a.user_id = auth.uid())
                    || ' / ' || (select e.name from public.employees e where e.id = md5('eid-e1')::uuid)$s$,
          '1 / EMP-9901 / 01799990011 / Zz Signup Name'),
      (8, 'Sign-up never adds an employee record', 'new-login',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '01799990011', 'EMP-9901');
             select count(*)::text from public.employees where token_no in (990011, 990012, 990013)$s$,
          '3'),
      (9, 'The employee can then mark their own meals', 'new-login',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '01799990011', 'EMP-9901');
             insert into public.meal_records (employee_id, meal_date, lunch)
             values (md5('eid-e1')::uuid, (now() at time zone 'Asia/Dhaka')::date + 2, true) returning 'ALLOW'$s$,
          'ALLOW'),
      (10, 'A phone number that isn''t a mobile number is refused', 'new-login',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '0170', 'EMP-9901')$s$, 'bad_phone'),
      (11, 'A second login can''t claim a token that already signed up', 'dup-login',
          $s$select public.register_employee_signup(990012, 'Zz Someone Else', '01799990099', 'EMP-9904')$s$, 'taken'),
      (12, 'A login can only ever claim the Employee ID it was created with', 'new-login',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '01799990011', 'EMP-OTHER');
             select employee_code from public.employee_accounts where user_id = auth.uid()$s$,
          'emp-9901'),
      (13, 'A login that is not an Employee ID address can''t link', 'manager',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '01799990011', 'EMP-9901')$s$, 'not_found'),
      (14, 'register_employee() confirms a login that is linked', 'linked-login',
          $s$select public.register_employee()$s$, 'ok'),
      (15, 'register_employee() reports a login that never finished signing up', 'new-login',
          $s$select public.register_employee()$s$, 'not_found'),
      (16, 'Signed out can''t sign up', 'anon',
          $s$select public.register_employee_signup(990011, 'Zz Signup Name', '01799990011', 'EMP-9901')$s$, 'REJECT'),
      (17, 'An employee can''t reset a login', 'linked-login',
          $s$select public.reset_employee_login(md5('eid-e2')::uuid)::text$s$, 'REJECT'),
      (18, 'A manager can''t write an Employee ID directly', 'manager',
          $s$update public.employee_accounts set employee_code = 'EMP-HACK'
              where employee_id = md5('eid-e2')::uuid returning 'ALLOW'$s$, 'REJECT'),
      (19, 'A signed-up employee''s Employee ID can''t change under their login', 'postgres',
          $s$update public.employee_accounts set employee_code = 'EMP-MOVED'
              where employee_id = md5('eid-e2')::uuid returning 'ALLOW'$s$, 'REJECT'),
      (20, 'Two employees can''t share an Employee ID (any capitalisation)', 'postgres',
          $s$insert into public.employee_accounts (employee_id, employee_code)
             values (md5('eid-e1')::uuid, 'emp-9902') returning 'ALLOW'$s$, 'REJECT'),
      (21, 'Reset clears the login and the Employee ID, keeps employee and phone', 'manager (sql editor)',
          $s$select public.reset_employee_login(md5('eid-e2')::uuid);
             select 'logins=' || (select count(*) from auth.users where email = 'emp-id-emp-9902@mess-manager.app')
                 || ' / employee=' || (select count(*) from public.employees where id = md5('eid-e2')::uuid)
                 || ' / code=' || (select coalesce(employee_code, 'null') from public.employee_accounts where employee_id = md5('eid-e2')::uuid)
                 || ' / phone=' || (select phone from public.employee_accounts where employee_id = md5('eid-e2')::uuid)$s$,
          'logins=0 / employee=1 / code=null / phone=01799990012'),
      (22, 'After a reset, that token and Employee ID can sign up again', 'manager',
          $s$select public.reset_employee_login(md5('eid-e2')::uuid);
             select public.employee_signup_check(990012, 'EMP-9902')$s$, 'ok'),
      (23, 'A token login address no longer links (sign-in is by Employee ID)', 'token-login',
          $s$select public.register_employee()$s$, 'not_found')
    ) as t(n, name, who, sql, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;

    begin
      -- E1 (990011) hasn't signed up; E2 (990012) signed up with Employee ID
      -- EMP-9902 and a phone number; E3 (990013) is deactivated; plus a mess
      -- manager and some logins.
      insert into public.employees (id, name, token_no, is_active) values
        (md5('eid-e1')::uuid, 'zz id check 1 (rolled back)', 990011, true),
        (md5('eid-e2')::uuid, 'zz id check 2 (rolled back)', 990012, true),
        (md5('eid-e3')::uuid, 'zz id check 3 (rolled back)', 990013, false);
      insert into auth.users (id, email, aud, role) values
        (md5('eid-login-e2')::uuid, 'emp-id-emp-9902@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('eid-login-new')::uuid, 'emp-id-emp-9901@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('eid-login-dup')::uuid, 'emp-id-emp-9904@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('eid-login-token')::uuid, 'emp-t990011@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('eid-manager')::uuid, 'zz-eid-manager@mess-manager.test', 'authenticated', 'authenticated');
      insert into public.employee_accounts (employee_id, employee_code, phone, user_id)
      values (md5('eid-e2')::uuid, 'EMP-9902', '01799990012', md5('eid-login-e2')::uuid);
      insert into public.admin_profiles (id, full_name) values (md5('eid-manager')::uuid, 'zz eid manager');

      if c.who = 'anon' then
        set local role anon;
      elsif c.who = 'manager (sql editor)' then
        -- The manager's identity, read back as the SQL editor (which can
        -- see auth.users).
        perform set_config('request.jwt.claims',
          json_build_object('sub', md5('eid-manager')::uuid, 'role', 'authenticated')::text, true);
      elsif c.who <> 'postgres' then
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case c.who when 'new-login' then md5('eid-login-new')::uuid
                            when 'linked-login' then md5('eid-login-e2')::uuid
                            when 'token-login' then md5('eid-login-token')::uuid
                            when 'manager' then md5('eid-manager')::uuid
                            else md5('eid-login-dup')::uuid end,
          'email', case c.who when 'new-login' then 'emp-id-emp-9901@mess-manager.app'
                              when 'linked-login' then 'emp-id-emp-9902@mess-manager.app'
                              when 'token-login' then 'emp-t990011@mess-manager.app'
                              when 'manager' then 'zz-eid-manager@mess-manager.test'
                              else 'emp-id-emp-9904@mess-manager.app' end,
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
$$;

select * from pg_temp.employee_id_signup_check() order by check_no;
