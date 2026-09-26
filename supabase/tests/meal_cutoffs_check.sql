-- Checks that the employee meal deadlines (migration 0009) are enforced by
-- the database. Paste into the Supabase SQL editor and Run; one row per
-- check, every row should say PASS.
--
-- Safe on the live project: changes nothing. Each check runs in its own
-- sub-transaction that is always rolled back (including the test employee
-- and cut-off times it sets up), and the helper is a pg_temp function that
-- disappears when the session ends.
--
-- Employee checks write as the `anon` role — exactly what the Employee Panel
-- or a hand-made REST call uses. Manager checks write as `authenticated`
-- with an existing mess manager's id (skipped if there is none yet).
-- "Before cut-off" / "after cut-off" are forced by setting the cut-off to
-- 23:59:59.999999 / 00:00, so the result doesn't depend on when you run it.

create or replace function pg_temp.meal_cutoffs_check()
returns table (check_no int, result text, check_name text, expected text, got text)
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_manager uuid := (select id from public.admin_profiles limit 1);
  v_emp uuid := gen_random_uuid();
  v_open constant time := '23:59:59.999999';
  v_shut constant time := '00:00';
  c record;
  v_got text;
begin
  check_no := 0;
  check_name := 'Migration 0009 installed (trigger on meal_records)';
  expected := 'yes';
  got := case when exists (
    select 1 from pg_trigger
     where tgname = 'trg_meal_records_enforce_cutoffs'
       and tgrelid = 'public.meal_records'::regclass
       and tgenabled <> 'D'
  ) then 'yes' else 'no' end;
  result := case when got = expected then 'PASS' else 'FAIL' end;
  return next;
  if got <> 'yes' then
    return;
  end if;

  for c in
    select * from (values
      -- n, name, role, cut-off for every meal, sql ($1 = employee, $2 = today), expected
      (1,  'Employee edits yesterday breakfast', 'anon', v_open,
           'insert into public.meal_records (employee_id, meal_date, breakfast) values ($1, $2 - 1, false) on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast', 'REJECT'),
      (2,  'Employee edits yesterday lunch', 'anon', v_open,
           'insert into public.meal_records (employee_id, meal_date, lunch) values ($1, $2 - 1, false) on conflict (employee_id, meal_date) do update set lunch = excluded.lunch', 'REJECT'),
      (3,  'Employee edits today breakfast before cut-off', 'anon', v_open,
           'insert into public.meal_records (employee_id, meal_date, breakfast) values ($1, $2, true) on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast', 'ALLOW'),
      (4,  'Employee edits today breakfast after cut-off', 'anon', v_shut,
           'insert into public.meal_records (employee_id, meal_date, breakfast) values ($1, $2, false) on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast', 'REJECT'),
      (5,  'Employee edits today lunch before cut-off', 'anon', v_open,
           'insert into public.meal_records (employee_id, meal_date, lunch) values ($1, $2, true) on conflict (employee_id, meal_date) do update set lunch = excluded.lunch', 'ALLOW'),
      (6,  'Employee edits today lunch after cut-off', 'anon', v_shut,
           'insert into public.meal_records (employee_id, meal_date, lunch) values ($1, $2, false) on conflict (employee_id, meal_date) do update set lunch = excluded.lunch', 'REJECT'),
      (7,  'Employee edits tomorrow breakfast (today locked)', 'anon', v_shut,
           'insert into public.meal_records (employee_id, meal_date, breakfast) values ($1, $2 + 1, true) on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast', 'ALLOW'),
      (8,  'Employee edits tomorrow lunch (today locked)', 'anon', v_shut,
           'insert into public.meal_records (employee_id, meal_date, lunch) values ($1, $2 + 1, true) on conflict (employee_id, meal_date) do update set lunch = excluded.lunch', 'ALLOW'),
      (10, 'Direct API update of today after cut-off', 'anon', v_shut,
           'update public.meal_records set lunch = false where employee_id = $1 and meal_date = $2', 'REJECT'),
      (11, 'Direct API update of a previous date', 'anon', v_open,
           'update public.meal_records set lunch = false where employee_id = $1 and meal_date = $2 - 1', 'REJECT'),
      (12, 'Mess Manager edits previous date', 'authenticated', v_shut,
           'update public.meal_records set lunch = false where employee_id = $1 and meal_date = $2 - 1', 'ALLOW'),
      (13, 'Mess Manager edits today after cut-off', 'authenticated', v_shut,
           'update public.meal_records set lunch = false where employee_id = $1 and meal_date = $2', 'ALLOW'),
      (14, 'Mess Manager edits future meal', 'authenticated', v_shut,
           'insert into public.meal_records (employee_id, meal_date, breakfast) values ($1, $2 + 1, true) on conflict (employee_id, meal_date) do update set breakfast = excluded.breakfast', 'ALLOW')
    ) as t(n, name, role, cutoff, sql, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;

    if c.role = 'authenticated' and v_manager is null then
      got := 'no mess manager account yet';
      result := 'SKIP';
      return next;
      continue;
    end if;

    begin
      -- Fixtures: a throwaway employee with every meal ON yesterday and today.
      insert into public.employees (id, name) values (v_emp, 'zz cut-off check (rolled back)');
      insert into public.meal_records (employee_id, meal_date, breakfast, lunch, dinner)
      values (v_emp, v_today - 1, true, true, true), (v_emp, v_today, true, true, true);
      update public.meal_cutoffs
         set breakfast_cutoff = c.cutoff, lunch_cutoff = c.cutoff, dinner_cutoff = c.cutoff;

      if c.role = 'authenticated' then
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
      end if;
      execute format('set local role %I', c.role);

      execute c.sql using v_emp, v_today;
      raise exception using errcode = 'P0T01', message = 'ALLOW';
    exception when others then
      -- Everything above, fixtures included, is rolled back here.
      v_got := case when sqlstate = 'P0T01' then 'ALLOW' else 'REJECT: ' || sqlerrm end;
    end;

    got := v_got;
    result := case when split_part(v_got, ':', 1) = c.expected then 'PASS' else 'FAIL' end;
    return next;
  end loop;

  -- The rule itself at exact Bangladesh clock times, around the deadlines and
  -- midnight (Asia/Dhaka is UTC+6), using the cut-offs currently saved.
  for c in
    select * from (values
      (21, 'Breakfast, 1 min before its cut-off', 'breakfast', 0, -1, 'ALLOW'),
      (22, 'Breakfast, exactly at its cut-off', 'breakfast', 0, 0, 'deadline_passed'),
      (23, 'Lunch, 1 min before its cut-off', 'lunch', 0, -1, 'ALLOW'),
      (24, 'Lunch, exactly at its cut-off', 'lunch', 0, 0, 'deadline_passed'),
      (25, 'Dinner, exactly at its cut-off', 'dinner', 0, 0, 'deadline_passed'),
      (26, 'Tomorrow lunch, after today''s lunch cut-off', 'lunch', 1, 0, 'ALLOW')
    ) as t(n, name, meal, day_offset, minute_offset, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;
    got := coalesce(public.meal_lock_reason(
      v_today + c.day_offset,
      c.meal,
      ((v_today + (select case c.meal when 'breakfast' then breakfast_cutoff
                                      when 'lunch' then lunch_cutoff
                                      else dinner_cutoff end
                     from public.meal_cutoffs))
        + make_interval(mins => c.minute_offset)) at time zone 'Asia/Dhaka'
    ), 'ALLOW');
    result := case when got = expected then 'PASS' else 'FAIL' end;
    return next;
  end loop;

  for c in
    select * from (values
      (27, 'Midnight: 23:59:59 Dhaka, tomorrow is still future', 1, '23:59:59'::time, 'ALLOW'),
      (28, 'Midnight: 00:00 Dhaka next day, today becomes past', 0, '24:00:00'::time, 'past_date')
    ) as t(n, name, day_offset, clock, expected)
  loop
    check_no := c.n;
    check_name := c.name;
    expected := c.expected;
    got := coalesce(public.meal_lock_reason(
      v_today + c.day_offset, 'dinner', (v_today + c.clock) at time zone 'Asia/Dhaka'
    ), 'ALLOW');
    result := case when got = expected then 'PASS' else 'FAIL' end;
    return next;
  end loop;
end;
$$;

select * from pg_temp.meal_cutoffs_check() order by check_no;
