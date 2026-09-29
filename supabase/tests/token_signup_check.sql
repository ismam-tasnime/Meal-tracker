-- Checks employee sign-up by Token Number (migration 0017). Paste into the
-- Supabase SQL editor and Run; one row per check, every row should say PASS.
--
-- Safe on the live project: changes nothing. Each check runs in its own
-- sub-transaction that is always rolled back, fixtures included. The test
-- employees use tokens 990001-990004, far above any real token.

create or replace function pg_temp.token_signup_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $$
declare
  c record;
  v_got text;
begin
  check_no := 0;
  check_name := 'Migration 0017 installed (token sign-up)';
  expected := 'yes';
  got := case when to_regprocedure('public.employee_signup_status(integer)') is not null
               and to_regprocedure('public.employee_signup_status(text)') is null
              then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, who (login id or 'postgres'), sql, expected
      (1, 'Unknown token can''t sign up', 'anon',
          $s$select public.employee_signup_status(990099)$s$, 'not_found'),
      (2, 'An employee''s token can sign up (no phone number needed)', 'anon',
          $s$select public.employee_signup_status(990001)$s$, 'ok'),
      (3, 'A deactivated employee''s token can''t', 'anon',
          $s$select public.employee_signup_status(990003)$s$, 'inactive'),
      (4, 'A token that already signed up is taken', 'anon',
          $s$select public.employee_signup_status(990002)$s$, 'taken'),
      (5, 'Signing up links the login to that employee, with no phone', 'new-login',
          $s$select public.register_employee();
             select (select count(*) from public.employee_accounts a where a.user_id = auth.uid()) || ' / '
                    || (select (a.phone is null)::text from public.employee_accounts a where a.user_id = auth.uid())$s$,
          '1 / true'),
      (6, 'The new employee can mark their own meals', 'new-login',
          $s$select public.register_employee();
             insert into public.meal_records (employee_id, meal_date, lunch)
             values (md5('tk-e1')::uuid, (now() at time zone 'Asia/Dhaka')::date + 2, true) returning 'ALLOW'$s$, 'ALLOW'),
      (7, 'A second login for a taken token is refused', 'dup-login',
          $s$select public.register_employee()$s$, 'taken'),
      (8, 'Two employees can''t share a token', 'postgres',
          $s$update public.employees set token_no = 990002 where id = md5('tk-e1')::uuid returning 'ALLOW'$s$, 'REJECT'),
      (9, 'A signed-up employee''s token can''t change under their login', 'postgres',
          $s$update public.employees set token_no = 990009 where id = md5('tk-e2')::uuid returning 'ALLOW'$s$, 'REJECT'),
      (10, 'A not-signed-up employee''s token can still change', 'postgres',
          $s$update public.employees set token_no = 990009 where id = md5('tk-e1')::uuid returning 'ALLOW'$s$, 'ALLOW'),
      (11, 'Reset login removes the token login, keeps employee and phone', 'manager (sql editor)',
          $s$select public.reset_employee_login(md5('tk-e2')::uuid);
             select 'logins=' || (select count(*) from auth.users where email = 'emp-t990002@mess-manager.app')
                 || ' / employee=' || (select count(*) from public.employees where id = md5('tk-e2')::uuid)
                 || ' / phone=' || (select phone from public.employee_accounts where employee_id = md5('tk-e2')::uuid)$s$,
          'logins=0 / employee=1 / phone=01799999992'),
      (12, 'After a reset, the token can sign up again', 'manager',
          $s$select public.reset_employee_login(md5('tk-e2')::uuid);
             select public.employee_signup_status(990002)$s$, 'ok'),
      (13, 'A phone-number login address no longer links', 'phone-login',
          $s$select public.register_employee()$s$, 'not_found'),
      (14, 'Signed out can''t link a login', 'anon',
          $s$select public.register_employee()$s$, 'REJECT'),
      (15, 'Signed out can''t reset a login', 'anon',
          $s$select public.reset_employee_login(md5('tk-e2')::uuid)::text$s$, 'REJECT'),
      (16, 'An employee can''t reset a login', 'new-login',
          $s$select public.reset_employee_login(md5('tk-e2')::uuid)::text$s$, 'REJECT')
    ) as t(n, name, who, sql, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;

    begin
      -- E1 (990001) hasn't signed up; E2 (990002) signed up earlier and has
      -- an old phone number; E3 (990003) is deactivated; a mess manager.
      insert into public.employees (id, name, token_no, is_active) values
        (md5('tk-e1')::uuid, 'zz token check 1 (rolled back)', 990001, true),
        (md5('tk-e2')::uuid, 'zz token check 2 (rolled back)', 990002, true),
        (md5('tk-e3')::uuid, 'zz token check 3 (rolled back)', 990003, false);
      insert into auth.users (id, email, aud, role) values
        (md5('tk-login-e2')::uuid, 'emp-t990002@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('tk-login-new')::uuid, 'emp-t990001@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('tk-login-dup')::uuid, 'emp-t990002-dup@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('tk-login-phone')::uuid, 'emp-01799999991@mess-manager.app', 'authenticated', 'authenticated'),
        (md5('tk-manager')::uuid, 'zz-tk-manager@mess-manager.test', 'authenticated', 'authenticated');
      insert into public.employee_accounts (employee_id, phone, user_id)
      values (md5('tk-e2')::uuid, '01799999992', md5('tk-login-e2')::uuid);
      insert into public.admin_profiles (id, full_name) values (md5('tk-manager')::uuid, 'zz tk manager');

      if c.who = 'anon' then
        set local role anon;
      elsif c.who = 'manager (sql editor)' then
        -- The manager's identity, read back as the SQL editor (which can
        -- see auth.users).
        perform set_config('request.jwt.claims',
          json_build_object('sub', md5('tk-manager')::uuid, 'role', 'authenticated')::text, true);
      elsif c.who <> 'postgres' then
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case c.who when 'new-login' then md5('tk-login-new')::uuid
                            when 'phone-login' then md5('tk-login-phone')::uuid
                            when 'manager' then md5('tk-manager')::uuid
                            else md5('tk-login-dup')::uuid end,
          'email', case c.who when 'new-login' then 'emp-t990001@mess-manager.app'
                              when 'phone-login' then 'emp-01799999991@mess-manager.app'
                              when 'manager' then 'zz-tk-manager@mess-manager.test'
                              else 'emp-t990002@mess-manager.app' end,
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
    result := case when got = c.expected or split_part(got, ':', 1) = c.expected
                   then 'PASS' else 'FAIL' end;
    return next;
  end loop;
end;
$$;

select * from pg_temp.token_signup_check() order by check_no;
