-- What's being served: the mess manager announces the dish for a date's
-- breakfast, lunch and dinner ("Khichuri", "Beef", ...), and employees see
-- it under that meal in the Employee Panel.
--
-- Keyed by date alone, like meal_cutoffs (0009) and unlike meal_day_weights
-- (0006). The menu is an office-wide fact about a day — what the cook is
-- making — not billing data owned by one mess month, so employees can read
-- it straight from the table. Scoping it to a period would instead need a
-- SECURITY DEFINER function, because employees can't read mess_periods.
--
-- No row, or a null column, means "nothing announced for that meal" and the
-- panel shows nothing. The columns reject a blank string so "not announced"
-- has exactly one representation. Additive only: one new table.

create table if not exists public.meal_menus (
  meal_date date primary key,
  breakfast_item text check (breakfast_item is null or char_length(breakfast_item) between 1 and 80),
  lunch_item text check (lunch_item is null or char_length(lunch_item) between 1 and 80),
  dinner_item text check (dinner_item is null or char_length(dinner_item) between 1 and 80),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_meal_menus_updated_at on public.meal_menus;
create trigger trg_meal_menus_updated_at
  before update on public.meal_menus
  for each row execute function public.set_updated_at();

alter table public.meal_menus enable row level security;

-- Visitors only ever read the menu; managers write it through the policies
-- below (RLS denies by default, so this is defense in depth).
revoke insert, update, delete, truncate on public.meal_menus from anon;

-- Everyone can read it: the Employee Panel shows the dish under each meal.
drop policy if exists meal_menus_select_all on public.meal_menus;
create policy meal_menus_select_all
  on public.meal_menus for select
  to anon, authenticated
  using (true);

-- The menu is office-wide (like the deadlines in 0009), so any mess manager
-- may announce or change it.
drop policy if exists meal_menus_manager_insert on public.meal_menus;
create policy meal_menus_manager_insert
  on public.meal_menus for insert
  to authenticated
  with check (private.is_admin());

drop policy if exists meal_menus_manager_update on public.meal_menus;
create policy meal_menus_manager_update
  on public.meal_menus for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Blanking all three boxes removes the day's row entirely.
drop policy if exists meal_menus_manager_delete on public.meal_menus;
create policy meal_menus_manager_delete
  on public.meal_menus for delete
  to authenticated
  using (private.is_admin());
