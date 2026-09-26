-- Employee meal deadlines (cut-off times), enforced in the database.
--
-- Rules for employees (anyone not signed in as a mess manager):
--   * a date before today (Asia/Dhaka)       -> no changes at all
--   * today, before that meal's cut-off time -> can change that meal
--   * today, at/after that meal's cut-off     -> that meal is locked
--   * a date after today                      -> can change freely
-- Mess managers (an admin_profiles row, i.e. private.is_admin()) can change
-- any meal on any date at any time. So can the SQL editor / service role.
--
-- The existing meal_records RLS policies are unchanged: the public panel
-- still writes straight to the table. A BEFORE INSERT/UPDATE trigger does
-- the check instead, because RLS can't compare a row's old and new values
-- (it can't tell "turned lunch ON" from "left lunch alone while changing
-- dinner"). The trigger runs on every write however it arrives — app,
-- supabase-js, or a hand-made REST call — so there's no way around it.
--
-- Additive only: one new table, two new functions, one new trigger. No
-- existing data, table, or policy is changed or removed.

-- ---------------------------------------------------------------------------
-- Settings: one row of cut-off times (office local time, Asia/Dhaka)
-- ---------------------------------------------------------------------------

create table if not exists public.meal_cutoffs (
  -- Always true: the primary key + check allow exactly one row.
  id boolean primary key default true check (id),
  breakfast_cutoff time not null default '08:00',
  lunch_cutoff time not null default '11:00',
  dinner_cutoff time not null default '17:00',
  updated_at timestamptz not null default now()
);

insert into public.meal_cutoffs (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_meal_cutoffs_updated_at on public.meal_cutoffs;
create trigger trg_meal_cutoffs_updated_at
  before update on public.meal_cutoffs
  for each row execute function public.set_updated_at();

alter table public.meal_cutoffs enable row level security;

-- The single row is created above; clients may only read it or (managers)
-- update it.
revoke insert, delete, truncate on public.meal_cutoffs from anon, authenticated;
revoke update on public.meal_cutoffs from anon;

-- Everyone can read the times: the Employee Panel shows which meals are locked.
drop policy if exists meal_cutoffs_select_all on public.meal_cutoffs;
create policy meal_cutoffs_select_all
  on public.meal_cutoffs for select
  to anon, authenticated
  using (true);

-- Deadlines are an office-wide rule (like the shared employee list), so any
-- mess manager can change them.
drop policy if exists meal_cutoffs_manager_update on public.meal_cutoffs;
create policy meal_cutoffs_manager_update
  on public.meal_cutoffs for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- The rule itself, as a pure function of (date, meal, moment)
-- ---------------------------------------------------------------------------

-- Returns null when an employee may change this meal at p_now, otherwise
-- 'past_date' or 'deadline_passed'. "Today" and the clock are Bangladesh
-- time (Asia/Dhaka), whatever the database server's or browser's timezone.
-- Taking p_now as an argument keeps it testable (e.g. around midnight).
-- Lives in public (like the other trigger helpers) so the anonymous role
-- needs no access to the private schema; calling it over the API only
-- reveals the cut-off times, which are public anyway.
create or replace function public.meal_lock_reason(
  p_meal_date date,
  p_meal text,
  p_now timestamptz
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Dhaka';
  v_today date := v_local::date;
  v_cutoff time;
begin
  if p_meal_date < v_today then
    return 'past_date';
  end if;
  if p_meal_date > v_today then
    return null;
  end if;

  select case p_meal
           when 'breakfast' then c.breakfast_cutoff
           when 'lunch' then c.lunch_cutoff
           when 'dinner' then c.dinner_cutoff
         end
    into v_cutoff
    from public.meal_cutoffs c
   where c.id;

  -- Cut-off 08:00 means editable until 07:59:59, locked from 08:00:00.
  if v_cutoff is not null and v_local::time >= v_cutoff then
    return 'deadline_passed';
  end if;
  return null;
end;
$$;

revoke all on function public.meal_lock_reason(date, text, timestamptz) from public;
grant execute on function public.meal_lock_reason(date, text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement trigger on meal_records
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER on purpose, so current_user is the real caller:
--   anon          -> the public Employee Panel, always checked
--   authenticated -> checked unless they are a mess manager
--   anything else -> postgres / service_role (SQL editor), not checked
create or replace function public.enforce_meal_cutoffs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meal text;
  v_old boolean;
  v_new boolean;
  v_reason text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  -- Nested, not `and`: SQL doesn't promise to skip the second test, and
  -- anon may not call private.is_admin().
  if current_user = 'authenticated' then
    if private.is_admin() then
      return new;
    end if;
  end if;

  -- A previous date can't be touched at all. This also catches an upsert
  -- (insert ... on conflict do update) before it reaches the update step.
  if public.meal_lock_reason(new.meal_date, 'breakfast', now()) = 'past_date' then
    raise exception 'MEAL_LOCKED: Previous days cannot be changed.'
      using errcode = 'P0001',
            hint = 'Ask the Mess Manager to correct past meals.';
  end if;

  -- Today / future: reject only meals whose value actually changes and whose
  -- deadline has passed. A new row starts from all-OFF, so on insert a meal
  -- "changes" only if it's being turned ON.
  foreach v_meal in array array['breakfast', 'lunch', 'dinner'] loop
    v_new := case v_meal when 'breakfast' then new.breakfast
                         when 'lunch' then new.lunch
                         else new.dinner end;
    if tg_op = 'UPDATE' then
      v_old := case v_meal when 'breakfast' then old.breakfast
                           when 'lunch' then old.lunch
                           else old.dinner end;
    else
      v_old := false;
    end if;

    if v_new is distinct from v_old then
      v_reason := public.meal_lock_reason(new.meal_date, v_meal, now());
      if v_reason is not null then
        raise exception 'MEAL_LOCKED: The % selection deadline has passed.', v_meal
          using errcode = 'P0001',
                hint = 'Please contact the Mess Manager for corrections.';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.enforce_meal_cutoffs() from public;
grant execute on function public.enforce_meal_cutoffs() to anon, authenticated;

drop trigger if exists trg_meal_records_enforce_cutoffs on public.meal_records;
create trigger trg_meal_records_enforce_cutoffs
  before insert or update on public.meal_records
  for each row execute function public.enforce_meal_cutoffs();
