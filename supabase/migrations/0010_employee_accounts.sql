-- Employee accounts: every employee signs in with their own phone number.
--
-- Until now the Employee Panel had no login and anyone with the link could
-- switch anyone's meals. From this migration on:
--
--   * The mess manager adds a phone number to an employee (Employees tab).
--   * That employee signs up once at /employee/signup with the phone number
--     and a password. Only a number the manager has added can sign up, and
--     each number only once.
--   * A signed-in employee can change only their own meals (still within
--     the 0009 meal deadlines) and see only their own bill and deposits.
--   * Nobody signed out can change a meal any more. The cook's read-only
--     meal board stays public (meal_records and employees are still
--     readable by anyone).
--
-- Supabase Auth logs in by email, so each phone number maps to a fixed
-- internal login address, like the month logins in 0005:
-- 01712345678 -> emp-01712345678@mess-manager.app (employeeAccountEmail() in
-- src/lib/utils/phone.ts). No mail is ever sent to it.
--
-- Phone numbers live in their own table, not on employees, because the
-- employees table is public (the meal board reads it) and phone numbers
-- must not be.

-- ---------------------------------------------------------------------------
-- employee_accounts: one row per employee who has a phone number
-- ---------------------------------------------------------------------------

create table if not exists public.employee_accounts (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  -- Bangladesh mobile number, stored as 01XXXXXXXXX.
  phone text not null unique check (phone ~ '^01[3-9][0-9]{8}$'),
  -- The login that claimed this number; null until the employee signs up.
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_employee_accounts_updated_at on public.employee_accounts;
create trigger trg_employee_accounts_updated_at
  before update on public.employee_accounts
  for each row execute function public.set_updated_at();

-- The login address is derived from the phone number, so changing the
-- number of an account that has already signed up would strand that login.
-- The manager resets the login first (reset_employee_login below).
create or replace function public.guard_employee_account_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone and old.user_id is not null then
    raise exception 'ACCOUNT_LINKED: This employee has already signed up with %.', old.phone
      using errcode = 'P0001',
            hint = 'Reset their login first, then change the number.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_employee_account_phone() from public;

drop trigger if exists trg_employee_accounts_guard_phone on public.employee_accounts;
create trigger trg_employee_accounts_guard_phone
  before update on public.employee_accounts
  for each row execute function public.guard_employee_account_phone();

alter table public.employee_accounts enable row level security;

-- Managers add and change phone numbers; user_id is only ever set by
-- register_employee() and cleared by reset_employee_login() below.
revoke all on public.employee_accounts from anon;
revoke all on public.employee_accounts from authenticated;
grant select, delete on public.employee_accounts to authenticated;
grant insert (employee_id, phone), update (phone) on public.employee_accounts to authenticated;

drop policy if exists employee_accounts_select on public.employee_accounts;
create policy employee_accounts_select
  on public.employee_accounts for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists employee_accounts_admin_insert on public.employee_accounts;
create policy employee_accounts_admin_insert
  on public.employee_accounts for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists employee_accounts_admin_update on public.employee_accounts;
create policy employee_accounts_admin_update
  on public.employee_accounts for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Only a number nobody has signed up with can be removed outright.
drop policy if exists employee_accounts_admin_delete on public.employee_accounts;
create policy employee_accounts_admin_delete
  on public.employee_accounts for delete
  to authenticated
  using ((select private.is_admin()) and user_id is null);

-- ---------------------------------------------------------------------------
-- Who is the signed-in employee?
-- ---------------------------------------------------------------------------

-- The caller's employee id, or null (signed out, a manager, not signed up,
-- or deactivated). SECURITY DEFINER so policies can use it without going
-- through employee_accounts' own policy.
create or replace function private.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.employee_id
    from public.employee_accounts a
    join public.employees e on e.id = a.employee_id
   where a.user_id = auth.uid()
     and e.is_active;
$$;

revoke all on function private.my_employee_id() from public;
revoke all on function private.my_employee_id() from anon;
grant execute on function private.my_employee_id() to authenticated;

-- ---------------------------------------------------------------------------
-- meal_records: no more anonymous writes
-- ---------------------------------------------------------------------------

drop policy if exists meal_records_public_insert on public.meal_records;
drop policy if exists meal_records_public_update on public.meal_records;

revoke insert, update, delete, truncate on public.meal_records from anon;

-- An employee writes only their own row; a mess manager writes anyone's.
-- The 0009 deadline trigger still applies to employees.
drop policy if exists meal_records_owner_insert on public.meal_records;
create policy meal_records_owner_insert
  on public.meal_records for insert
  to authenticated
  with check (
    employee_id = (select private.my_employee_id()) or (select private.is_admin())
  );

drop policy if exists meal_records_owner_update on public.meal_records;
create policy meal_records_owner_update
  on public.meal_records for update
  to authenticated
  using (employee_id = (select private.my_employee_id()) or (select private.is_admin()))
  with check (employee_id = (select private.my_employee_id()) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Sign-up
-- ---------------------------------------------------------------------------

-- Before creating a login: may this number sign up? Called signed out, so
-- it only answers with a status, never a name or id:
--   'ok'        — the manager added it and nobody has signed up with it
--   'not_found' — no employee has this number
--   'inactive'  — the employee is deactivated
--   'taken'     — someone already signed up with it
create or replace function public.employee_signup_status(p_phone text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
              when a.user_id is not null then 'taken'
              when not e.is_active then 'inactive'
              else 'ok'
            end
       from public.employee_accounts a
       join public.employees e on e.id = a.employee_id
      where a.phone = p_phone),
    'not_found'
  );
$$;

revoke all on function public.employee_signup_status(text) from public;
grant execute on function public.employee_signup_status(text) to anon, authenticated;

-- Called right after Supabase Auth signup (and on every sign-in, which makes
-- it idempotent). Takes no arguments on purpose: the phone number is read
-- from the caller's own login address, so a login can only ever claim the
-- employee whose number it was created with. Same statuses as above.
create or replace function private.register_employee()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_match text[];
  v_account public.employee_accounts%rowtype;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'Must be signed in to register as an employee';
  end if;

  if exists (select 1 from public.employee_accounts where user_id = v_uid) then
    return 'ok';
  end if;

  v_match := regexp_match(
    lower(coalesce(auth.jwt() ->> 'email', '')),
    '^emp-(01[3-9][0-9]{8})@mess-manager\.app$'
  );
  if v_match is null then
    return 'not_found';
  end if;

  select * into v_account
    from public.employee_accounts
   where phone = v_match[1]
   for update;
  if not found then
    return 'not_found';
  end if;
  if v_account.user_id is not null then
    return 'taken';
  end if;

  select is_active into v_active from public.employees where id = v_account.employee_id;
  if not v_active then
    return 'inactive';
  end if;

  update public.employee_accounts set user_id = v_uid where employee_id = v_account.employee_id;
  return 'ok';
end;
$$;

revoke all on function private.register_employee() from public;
revoke all on function private.register_employee() from anon;
grant execute on function private.register_employee() to authenticated;

create or replace function public.register_employee()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.register_employee();
$$;

revoke all on function public.register_employee() from public;
revoke all on function public.register_employee() from anon;
grant execute on function public.register_employee() to authenticated;

-- ---------------------------------------------------------------------------
-- Reset a login (forgotten password, wrong person signed up)
-- ---------------------------------------------------------------------------

-- Mess managers only. Deletes the Supabase Auth login for this employee's
-- phone number — whether or not it finished registering — so the employee
-- can sign up again with a new password. Meal history is untouched.
create or replace function private.reset_employee_login(p_employee_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_account public.employee_accounts%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Only a mess manager can reset an employee login';
  end if;

  select * into v_account from public.employee_accounts where employee_id = p_employee_id;
  if not found then
    return false;
  end if;

  delete from auth.users
   where id = v_account.user_id
      or lower(email) = 'emp-' || v_account.phone || '@mess-manager.app';

  -- The foreign key already cleared it; explicit in case the login was gone.
  update public.employee_accounts set user_id = null where employee_id = p_employee_id;
  return true;
end;
$$;

revoke all on function private.reset_employee_login(uuid) from public;
revoke all on function private.reset_employee_login(uuid) from anon;
grant execute on function private.reset_employee_login(uuid) to authenticated;

create or replace function public.reset_employee_login(p_employee_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.reset_employee_login(p_employee_id);
$$;

revoke all on function public.reset_employee_login(uuid) from public;
revoke all on function public.reset_employee_login(uuid) from anon;
grant execute on function public.reset_employee_login(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- An employee's own bill for one mess month
-- ---------------------------------------------------------------------------

-- p_start is the month's first day (the 5th). Works whether or not a mess
-- manager has signed up for that month yet: without one, the meal count
-- uses the default meal counts and there is no rate or deposit.
-- SECURITY DEFINER because employees can't read mess_periods, deposits or
-- meal_day_weights; it only ever answers for the caller's own employee.
-- Same arithmetic as get_period_report() (0007).
create or replace function public.get_my_statement(p_start date)
returns table (
  period_exists boolean,
  meal_rate numeric,
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
    select p.id, p.meal_rate
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
    period_exists, meal_rate,
    breakfast_count, lunch_count, dinner_count, meal_count,
    total_bill,                            -- null until the meal rate is set
    total_deposit,
    total_deposit - total_bill as balance, -- null until the meal rate is set
    deposits
  from summary
  where (select employee_id from me) is not null
    and extract(day from p_start) = 5;
$$;

revoke all on function public.get_my_statement(date) from public;
revoke all on function public.get_my_statement(date) from anon;
grant execute on function public.get_my_statement(date) to authenticated;
