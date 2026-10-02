-- Employees sign in with their Employee ID; the Token Number stays the
-- key that authorises the sign-up.
--
-- Sign-up now asks for Name, Token Number, Employee ID, Phone Number and a
-- password (twice). The Token Number is still checked against the mess
-- manager's employee list (public.employees.token_no, 0007) and is still
-- what links the new login to that employee record — nothing may sign up
-- with a token that isn't on the list, or with one that already has an
-- account. On top of that, sign-up now:
--
--   * stores the Employee ID on employee_accounts (employee_code), unique
--     across the office, and uses it as the login key:
--     EMP-1024 -> emp-id-emp-1024@mess-manager.app
--     (employeeAccountEmail() in src/lib/utils/employee-id.ts).
--     No mail is ever sent to it.
--   * stores the phone number on the same row (the column 0010 added).
--   * updates the employee record's name to the name typed at sign-up.
--
-- Nothing is deleted and no employee record is ever created here: an
-- account is only ever attached to the employee the token already names.
-- Token numbers keep every other job they have (the employee list, the
-- meal board, reports, reset login).
--
-- The one kind of existing data that has to move is a login created with
-- the old token address (0017): it is renamed to an Employee ID address so
-- that employee keeps their password, with their token number as their
-- Employee ID until a mess manager resets their login.

-- ---------------------------------------------------------------------------
-- 1. employee_accounts.employee_code: the Employee ID
-- ---------------------------------------------------------------------------

-- Letters, digits, - and _, starting with a letter or digit, up to 32
-- characters: what fits in the login address above. Case is kept as typed
-- but never distinguishes two accounts (the unique index is on lower()).
alter table public.employee_accounts
  add column if not exists employee_code text;

alter table public.employee_accounts
  drop constraint if exists employee_accounts_employee_code_check;
alter table public.employee_accounts
  add constraint employee_accounts_employee_code_check
    check (employee_code is null or employee_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$');

create unique index if not exists employee_accounts_employee_code_key
  on public.employee_accounts (lower(employee_code))
  where employee_code is not null;

comment on column public.employee_accounts.employee_code is
  'The Employee ID the employee signs in with. Unique, case-insensitive. '
  'Null until they sign up; cleared again by reset_employee_login().';

-- Only the SECURITY DEFINER functions below write it: managers were granted
-- insert (employee_id, phone) / update (phone) in 0010 and a new column is
-- not granted to anyone, so no client can set or change an Employee ID.

-- ---------------------------------------------------------------------------
-- 2. Existing token logins move to an Employee ID address
-- ---------------------------------------------------------------------------

-- Runs before the guard trigger below, which would (rightly) refuse to
-- change the Employee ID of a signed-up employee. Their Employee ID becomes
-- their token number, so they keep their password and sign in with it; a
-- mess manager can reset their login if they want their real Employee ID on
-- the account. Only rows with no Employee ID yet are touched, so re-running
-- this migration changes nothing.
update public.employee_accounts a
   set employee_code = e.token_no::text
  from public.employees e, auth.users u
 where e.id = a.employee_id
   and u.id = a.user_id
   and a.employee_code is null
   and e.token_no is not null
   and u.email ~ '^emp-t[0-9]+@mess-manager\.app$';

update auth.users u
   set email = 'emp-id-' || lower(a.employee_code) || '@mess-manager.app'
  from public.employee_accounts a
 where u.id = a.user_id
   and a.employee_code is not null
   and u.email ~ '^emp-t[0-9]+@mess-manager\.app$';

update auth.identities i
   set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email))
  from auth.users u
 where i.user_id = u.id
   and i.provider = 'email'
   and u.email ~ '^emp-id-[a-z0-9][a-z0-9_-]*@mess-manager\.app$'
   and i.identity_data ->> 'email' is distinct from u.email;

-- ---------------------------------------------------------------------------
-- 3. A signed-up employee's Employee ID can't change under their login
-- ---------------------------------------------------------------------------

-- The login address comes from the Employee ID, so changing it while the
-- account is linked would strand that login. Same rule the phone number
-- (0010) and the token number (0017) have. Clearing it as part of unlinking
-- the account is allowed — that is what reset_employee_login() does.
create or replace function public.guard_employee_account_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.employee_code is distinct from old.employee_code
     and old.user_id is not null and new.user_id is not null then
    raise exception 'ACCOUNT_LINKED: This employee has already signed up with Employee ID %.', old.employee_code
      using errcode = 'P0001',
            hint = 'Reset their login first, then they can sign up with another Employee ID.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_employee_account_code() from public, anon, authenticated;

drop trigger if exists trg_employee_accounts_guard_code on public.employee_accounts;
create trigger trg_employee_accounts_guard_code
  before update on public.employee_accounts
  for each row execute function public.guard_employee_account_code();

-- ---------------------------------------------------------------------------
-- 4. May this token + Employee ID sign up?
-- ---------------------------------------------------------------------------

-- Called signed out, before any login is created, so it only ever answers
-- with a status — never a name, id or phone number:
--   'ok'         — the token is on the employee list, the employee is
--                  active and hasn't signed up, and the Employee ID is free
--   'not_found'  — no employee has this token number
--   'inactive'   — the employee is deactivated
--   'taken'      — this token already has an account
--   'code_taken' — another employee already signed up with this Employee ID
--   'bad_code'   — the Employee ID isn't in the allowed form
create or replace function public.employee_signup_check(p_token integer, p_code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with token_row as (
    select e.id, e.is_active, a.user_id
      from public.employees e
      left join public.employee_accounts a on a.employee_id = e.id
     where e.token_no = p_token
  )
  select case
           when coalesce(p_code, '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' then 'bad_code'
           when not exists (select 1 from token_row) then 'not_found'
           when (select user_id from token_row) is not null then 'taken'
           when not (select is_active from token_row) then 'inactive'
           when exists (
             select 1 from public.employee_accounts a
              where lower(a.employee_code) = lower(p_code)
                and a.employee_id is distinct from (select id from token_row)
           ) then 'code_taken'
           else 'ok'
         end;
$$;

revoke all on function public.employee_signup_check(integer, text) from public;
grant execute on function public.employee_signup_check(integer, text) to anon, authenticated;

-- The token-only check from 0017 is kept as it is: it still answers
-- correctly for a token number and nothing depends on it changing.

-- ---------------------------------------------------------------------------
-- 5. Finishing a sign-up
-- ---------------------------------------------------------------------------

-- Called right after Supabase Auth creates the login. The Employee ID is
-- read from the caller's OWN login address, never from an argument, so a
-- login can only ever claim the Employee ID it was created with; p_code is
-- used only to keep the capitalisation the employee typed. The token number
-- says which employee record the account attaches to — the same check
-- employee_signup_check() just made, repeated here so it is the database,
-- not the app, that enforces it.
--
-- Also: the employee record's name is updated to p_name, and the phone
-- number is stored. No employee record is ever inserted, so a token that
-- already exists can never end up with a second one.
--
-- Statuses as above, plus 'bad_phone' for a number that isn't a
-- Bangladesh mobile number (the form the phone column has required
-- since 0010).
create or replace function private.register_employee_signup(
  p_token integer,
  p_name text,
  p_phone text,
  p_code text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_match text[];
  v_code text;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_employee public.employees%rowtype;
  v_account public.employee_accounts%rowtype;
  v_found boolean;
begin
  if v_uid is null then
    raise exception 'Must be signed in to register as an employee';
  end if;

  -- Already linked: idempotent success, and this login can never be
  -- re-pointed at another employee.
  if exists (select 1 from public.employee_accounts where user_id = v_uid) then
    return 'ok';
  end if;

  v_match := regexp_match(
    lower(coalesce(auth.jwt() ->> 'email', '')),
    '^emp-id-([a-z0-9][a-z0-9_-]{0,31})@mess-manager\.app$'
  );
  if v_match is null then
    return 'not_found';
  end if;
  -- Keep the typed capitalisation when it means the same Employee ID.
  v_code := case when lower(coalesce(btrim(p_code), '')) = v_match[1]
                 then btrim(p_code) else v_match[1] end;

  if v_phone is not null and v_phone !~ '^01[3-9][0-9]{8}$' then
    return 'bad_phone';
  end if;

  select * into v_employee
    from public.employees
   where token_no = p_token
   for update;
  if not found then
    return 'not_found';
  end if;

  select * into v_account
    from public.employee_accounts
   where employee_id = v_employee.id
   for update;
  v_found := found;
  if v_found and v_account.user_id is not null then
    return 'taken';
  end if;

  if not v_employee.is_active then
    return 'inactive';
  end if;

  if exists (
    select 1 from public.employee_accounts a
     where lower(a.employee_code) = lower(v_code)
       and a.employee_id <> v_employee.id
  ) then
    return 'code_taken';
  end if;

  if v_found then
    update public.employee_accounts
       set user_id = v_uid,
           employee_code = v_code,
           phone = coalesce(v_phone, phone)
     where employee_id = v_employee.id;
  else
    insert into public.employee_accounts (employee_id, user_id, employee_code, phone)
    values (v_employee.id, v_uid, v_code, v_phone);
  end if;

  -- The employee list keeps the name the employee signed up with.
  if v_name is not null then
    update public.employees set name = v_name where id = v_employee.id;
  end if;

  return 'ok';
exception
  when unique_violation then
    -- Two sign-ups racing for the same Employee ID (or token): the loser
    -- gets the same answer it would have got a moment earlier.
    return 'code_taken';
end;
$$;

revoke all on function private.register_employee_signup(integer, text, text, text) from public, anon;
grant execute on function private.register_employee_signup(integer, text, text, text) to authenticated;

create or replace function public.register_employee_signup(
  p_token integer,
  p_name text,
  p_phone text,
  p_code text default null
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.register_employee_signup(p_token, p_name, p_phone, p_code);
$$;

revoke all on function public.register_employee_signup(integer, text, text, text) from public, anon;
grant execute on function public.register_employee_signup(integer, text, text, text) to authenticated;

-- The no-argument version (0010, 0017) now only reports whether the
-- caller's login is already linked to an employee: linking needs a token
-- number, which only register_employee_signup() above accepts. Sign-in
-- still calls it, so a login that never finished signing up is told so
-- instead of landing on an empty panel.
create or replace function private.register_employee()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Must be signed in to register as an employee';
  end if;

  if exists (select 1 from public.employee_accounts where user_id = v_uid) then
    return 'ok';
  end if;

  return 'not_found';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reset a login: the Employee ID address too
-- ---------------------------------------------------------------------------

-- Every Supabase Auth login that belongs to one employee: the one linked to
-- their account row, plus any left over at an Employee ID address, or at the
-- older token (0017) or phone-number (0010) addresses. Split out of
-- reset_employee_login() below so that one holds the authorisation rule and
-- this one the mechanics. It authorises nothing itself and nothing is
-- granted EXECUTE on it — its only caller runs as the owner.
create or replace function private.delete_employee_logins(
  p_user uuid,
  p_code text,
  p_token integer,
  p_phone text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from auth.users
   where id = p_user
      or lower(email) = 'emp-id-' || lower(p_code) || '@mess-manager.app'
      or lower(email) = 'emp-t' || p_token || '@mess-manager.app'
      or lower(email) = 'emp-' || p_phone || '@mess-manager.app';
end;
$$;

revoke all on function private.delete_employee_logins(uuid, text, integer, text)
  from public, anon, authenticated;

-- As in 0017, plus the Employee ID address, and the Employee ID itself is
-- cleared so the employee can sign up again (with the same one or another).
-- Meal history, deposits, eggs and the phone number are untouched.
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
  v_code text;
  v_exists boolean;
begin
  if not private.is_admin() then
    raise exception 'Only a mess manager can reset an employee login';
  end if;

  select true, e.token_no, a.user_id, a.phone, a.employee_code
    into v_exists, v_token, v_user, v_phone, v_code
    from public.employees e
    left join public.employee_accounts a on a.employee_id = e.id
   where e.id = p_employee_id;
  if not coalesce(v_exists, false) then
    return false;
  end if;

  perform private.delete_employee_logins(v_user, v_code, v_token, v_phone);

  -- The foreign key already cleared user_id; explicit in case the login was
  -- gone. Unlinking and clearing the Employee ID in one update is what the
  -- guard trigger in section 3 allows.
  update public.employee_accounts
     set user_id = null, employee_code = null
   where employee_id = p_employee_id;
  return true;
end;
$$;
