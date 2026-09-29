-- Employees sign up and sign in with their Token Number instead of a phone
-- number.
--
-- The token number already exists (employees.token_no, 0007) and is unique
-- (employees_token_no_key), so it becomes the employee's login key:
-- token 12 -> emp-t12@mess-manager.app (employeeAccountEmail() in
-- src/lib/utils/token.ts). No mail is ever sent to it.
--
-- employee_accounts stays as the link between an employee and their login;
-- its phone column becomes optional and existing phone numbers are kept.
-- Nothing is deleted. The one kind of existing data that has to move is a
-- login created with the old phone address: it is renamed to its
-- employee's token address, so that employee keeps their password.

-- ---------------------------------------------------------------------------
-- 1. Phone no longer required (existing numbers stay as they are)
-- ---------------------------------------------------------------------------

alter table public.employee_accounts alter column phone drop not null;

-- ---------------------------------------------------------------------------
-- 2. A signed-up employee's token can't change under their login
-- ---------------------------------------------------------------------------

-- The login address comes from the token, so changing (or clearing) the
-- token of an employee who has signed up would strand that login. Same rule
-- the phone number had: the manager resets the login first.
create or replace function public.guard_employee_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.token_no is distinct from old.token_no
     and exists (select 1 from public.employee_accounts a
                  where a.employee_id = old.id and a.user_id is not null) then
    raise exception 'ACCOUNT_LINKED: This employee has already signed up with token %.', old.token_no
      using errcode = 'P0001',
            hint = 'Reset their login first, then change the token.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_employee_token() from public, anon, authenticated;

drop trigger if exists trg_employees_guard_token on public.employees;
create trigger trg_employees_guard_token
  before update of token_no on public.employees
  for each row execute function public.guard_employee_token();

-- ---------------------------------------------------------------------------
-- 3. Sign-up by token
-- ---------------------------------------------------------------------------

-- Before creating a login: may this token sign up? Same statuses as before:
--   'ok'        — an active employee has this token and hasn't signed up
--   'not_found' — no employee has this token
--   'inactive'  — the employee is deactivated
--   'taken'     — someone already signed up with it
drop function if exists public.employee_signup_status(text);

create or replace function public.employee_signup_status(p_token integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when e.id is null then 'not_found'
           when a.user_id is not null then 'taken'
           when not e.is_active then 'inactive'
           else 'ok'
         end
    from (select 1) one
    left join public.employees e on e.token_no = p_token
    left join public.employee_accounts a on a.employee_id = e.id;
$$;

revoke all on function public.employee_signup_status(integer) from public;
grant execute on function public.employee_signup_status(integer) to anon, authenticated;

-- Called right after Supabase Auth signup (and on every sign-in, which makes
-- it idempotent). Still takes no arguments: the token is read from the
-- caller's own login address, so a login can only ever claim the employee
-- whose token it was created with.
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
  v_employee public.employees%rowtype;
  v_account public.employee_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'Must be signed in to register as an employee';
  end if;

  if exists (select 1 from public.employee_accounts where user_id = v_uid) then
    return 'ok';
  end if;

  v_match := regexp_match(
    lower(coalesce(auth.jwt() ->> 'email', '')),
    '^emp-t([0-9]{1,9})@mess-manager\.app$'
  );
  if v_match is null then
    return 'not_found';
  end if;

  select * into v_employee
    from public.employees
   where token_no = v_match[1]::integer
   for update;
  if not found then
    return 'not_found';
  end if;

  select * into v_account
    from public.employee_accounts
   where employee_id = v_employee.id
   for update;
  if found and v_account.user_id is not null then
    return 'taken';
  end if;

  if not v_employee.is_active then
    return 'inactive';
  end if;

  if found then
    update public.employee_accounts set user_id = v_uid where employee_id = v_employee.id;
  else
    insert into public.employee_accounts (employee_id, user_id) values (v_employee.id, v_uid);
  end if;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reset a login: the token address too
-- ---------------------------------------------------------------------------

-- As in 0010, plus the token address, and it also works for a login whose
-- signup was interrupted before it was linked (no employee_accounts row).
create or replace function private.reset_employee_login(p_employee_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token integer;
  v_user uuid;
  v_phone text;
begin
  if not private.is_admin() then
    raise exception 'Only a mess manager can reset an employee login';
  end if;

  select e.token_no, a.user_id, a.phone into v_token, v_user, v_phone
    from public.employees e
    left join public.employee_accounts a on a.employee_id = e.id
   where e.id = p_employee_id;
  if not found then
    return false;
  end if;

  delete from auth.users
   where id = v_user
      or lower(email) = 'emp-t' || v_token || '@mess-manager.app'
      or lower(email) = 'emp-' || v_phone || '@mess-manager.app';

  -- The foreign key already cleared it; explicit in case the login was gone.
  update public.employee_accounts set user_id = null where employee_id = p_employee_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Existing logins move to their token address (password unchanged)
-- ---------------------------------------------------------------------------

update auth.users u
   set email = 'emp-t' || e.token_no || '@mess-manager.app'
  from public.employee_accounts a
  join public.employees e on e.id = a.employee_id
 where u.id = a.user_id
   and e.token_no is not null
   and u.email ~ '^emp-01[3-9][0-9]{8}@mess-manager\.app$';

update auth.identities i
   set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email))
  from auth.users u
 where i.user_id = u.id
   and i.provider = 'email'
   and u.email ~ '^emp-t[0-9]+@mess-manager\.app$'
   and i.identity_data ->> 'email' is distinct from u.email;
