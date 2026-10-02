# Meal Tracker

A mobile-first office meal management app. The landing page (`/`) is a
read-only board of today's meals for the cook: plate counts per meal and a
tick beside everyone who is eating, with no buttons to press. When the mess
manager has declared guests for today, each meal also shows its guests
separately (never mixed into the employee count) and the total to prepare,
e.g. Lunch: 175 employee meals · 100 guests · 275 to prepare. It refreshes
itself every minute. The header links to the two panels:

- **Employee Panel** (`/employee`) — each employee signs in with their own
  Employee ID and password, and sees only their own things. Nobody can
  change anyone else's meals. See [Employee accounts](#employee-accounts).
  - **My meals** — their breakfast/lunch/dinner ON/OFF for any date,
    changeable within the meal deadlines (see below). Past days are locked,
    and the deadlines are shown but only a mess manager can change them.
  - **Meals I had** — for any mess month, how many breakfasts, lunches and
    dinners they have already had; tapping one lists the dates (read-only,
    🔒). Past meals only: a meal counts once its day is over or today's
    deadline has passed, so upcoming meals switched ON don't count yet.
  - **My eggs** — for any mess month: eggs consumed, the price per egg, the
    egg total, and the same date by date (Date · Eggs · Price/egg · Total).
    Read-only: only the mess manager records eggs or sets their price. Eggs
    are an extra charge and never part of the meal count above.
  - **My deposit** — the month's total and each deposit.
  - **Bill calculator** — a **Dummy meal rate** box: type any rate to see
    the bill it would give for their past meals (meal count × rate) and what
    they'd pay or get back against their deposit. The dummy
    rate never leaves the employee's phone: it isn't sent to the server or
    saved in the database, and has no connection to the manager's rate. The
    phone remembers it under that employee's own account (so on a shared
    phone another employee never sees it), and signing out erases it
    (`src/lib/dummy-rate.ts`).
  - **My bill** — once the mess manager **publishes** the meal rate, a
    "The meal rate has been published" message with the rate, their meal
    cost, their egg charges, the total bill, what they've paid, and their
    due or refund. A rate the manager is only testing is never shown here,
    and an egg charge joins the bill only once the rate is published.
- **Mess Manager Panel** (`/admin`) — one account per mess month, shared by
  that month's team (~5 people). Each month's **manager period** runs meal
  by meal from the 5th's **lunch** to the next month's 5th **breakfast**
  (e.g. 5 Jan lunch → 5 Feb breakfast) — see
  [Manager periods](#manager-periods). The team signs up once at
  `/admin/signup` with the account name `January2026` and a password; each
  month can have only one account. Each month's data is private to its
  team. Tabs:
  - **Dashboard** — the manager period, meal by meal, marked **Active
    Manager Period**, **Manager Period Completed** or **Manager Period Not
    Started**, and the month's figures.
  - **Meal Status** — pick a date, set that date's meal counts
    (Breakfast 0.75 / Lunch 1.25 / Dinner 1.00 by default), set the month's
    **price per egg**, and see every employee's ON/OFF with their **egg
    qty · egg price · egg total** beside it. Eggs are an extra charge: a
    quantity never adds to breakfast, lunch, dinner or the meal count, and
    0 eggs removes the record. A quantity is saved at the price per egg of
    the moment, so changing that price later never re-prices eggs already
    recorded. A manager can fix ON/OFF only for the meals of their
    own manager period, and only while it's running; the employee
    deadlines don't apply to them. Once the period has ended the page is a
    read-only record of the month's meals. Also where the employee meal
    deadlines are set.
  - **Guest** — pick a date (inside the mess month) and enter how many
    guests eat breakfast, lunch and dinner (any number, 0–10,000 per meal).
    Guests are paid for by the office at fixed rates — Breakfast ৳60,
    Lunch ৳150, Dinner ৳150 per guest — and every bill is worked out as you
    type: each meal's guest bill (guests × rate) and the date's total. Below
    are the month's dates with guests (tap one to edit it) and the **Total
    Bill to Collect** for the month, meal by meal (also on the Dashboard, as
    "Guest bill to collect"). Saving a date again overwrites it; there's
    never a second record for the same date + meal. On the 5th each month
    declares its own meals' guests (the outgoing month breakfast, the
    incoming month lunch and dinner).
    The Employee Panel never shows guests; the cook's meal board shows
    today's guest counts (never bills).
  - **Expense Status** — record deposits (any number per employee, before
    or during the month, or none) and the meal rate, with two buttons:
    **Test meal rate** re-bills the manager's own pages only (try as many
    rates as you like during the month); **Publish meal rate** also sends it
    to every employee's panel with their bill and due/refund. Testing again
    after publishing doesn't change what employees see until the next
    publish (migration 0013).
  - **Spend** — the mess's spending: a table of Date · Person/Name · Total
    Spending with only the entries recorded (no blank dates). **+ Add
    Spending** opens a form (date, name, amount); any number of entries per
    date. Tap an entry to edit or delete it. **Sum Spending** has the
    database add up every entry of the mess month: **TOTAL MONTHLY
    SPENDING**. Dates must be inside the mess month (both 5ths count, so a
    payment on the 5th can go in either month), and months never mix.
    Employees never see spending.
  - **Report** — Employee → Meal Count → Meal Bill → Eggs → Total Bill →
    Total Deposit → Amount to be Paid, with CSV export.
  - **Employees** — shared employee list (add, rename, deactivate), each
    employee's Token Number, whether they've signed up, the Employee ID and
    phone number they signed up with, and a **Reset login** button.

## How the money works

```
daily meal count   = breakfast ON × breakfast count + lunch ON × lunch count + dinner ON × dinner count
monthly meal count = sum of daily meal counts over the manager period's own meals
                     (5th lunch … next 5th breakfast)
meal bill          = monthly meal count × meal rate
egg bill           = sum over the month of (egg quantity × that record's price per egg)
total bill         = meal bill + egg bill
balance            = total deposit − total bill
                     > 0 → remaining (refund) · = 0 → fully settled · < 0 → due
```

Meal counts are stored once per date (`meal_day_weights`), not per
employee, so changing a date's lunch count instantly updates everyone who
had lunch that day.

Guests and spending are separate from the employees' bills:

```
guest bill (one date)  = breakfast guests × 60 + lunch guests × 150 + dinner guests × 150
total bill to collect  = the same over every date of the mess month (paid by the office)
total monthly spending = sum of every spending entry in the mess month
```

Only the guest counts and the individual spending entries are stored;
every bill and total is calculated from them when shown, so they can't go
stale. The guest rates are `GUEST_MEAL_RATES` in `src/lib/utils/guests.ts`.

Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase
(Postgres + Auth + Row Level Security).

## How it's organized

```
src/
  app/
    page.tsx                 Landing page: today's read-only meal board (cook's view)
    employee/
      page.tsx               Employee Panel: my meals (ON/OFF) + my bill, signed-in employees only
      login/page.tsx         Employee sign-in (Employee ID + password, public route)
      signup/page.tsx        Employee sign-up (public route)
    admin/
      login/page.tsx         Mess manager sign-in (public route)
      signup/page.tsx        Mess manager sign-up (public route)
      (protected)/           Everything below requires a mess manager session
        page.tsx              Dashboard: your manager period and its status, month figures
        meals/page.tsx        Meal Status: per-date meal counts + employee ON/OFF
        guests/page.tsx       Guest: per-date guest counts, bills, month's Total Bill to Collect
        expenses/page.tsx     Expense Status: deposits + meal rate + balances
        spending/page.tsx     Spend: spending entries + Sum Spending
        reports/page.tsx      Final report + CSV export
        employees/page.tsx    Employee management (shared by all months)
  components/
    public/                  Shared UI (meal board, date nav, meal toggle)
    employee/                Employee Panel UI (sign-in form, my meals, my bill)
    admin/                   Mess manager UI (nav, forms, tables)
  lib/
    supabase/                Browser/server Supabase clients + auth middleware helper
    data/                    Read-only data fetching (server-only)
    actions/                 "use server" mutations (meals, mess money, employees, auth)
    auth/                    Mess manager / employee session resolution
    utils/                   Date (Asia/Dhaka), mess month (5th–5th), currency (BDT), Employee ID / phone login, egg, guest-bill and spending helpers
    types/database.ts        Hand-written types mirroring the SQL schema
  proxy.ts                   Next.js 16 "Proxy" (formerly middleware) — session refresh + /admin and /employee gates
supabase/
  migrations/                 Run in order: 0001 schema … 0018 Employee ID sign-in, 0019 eggs
  tests/meal_cutoffs_check.sql  Paste into the SQL Editor to verify meal deadlines (changes nothing)
  tests/guest_spending_check.sql  Same, for guest meals and spending (changes nothing)
  tests/manager_periods_check.sql  Same, for manager periods and data safety (changes nothing)
  tests/token_signup_check.sql  Same, for the Token Number rules (changes nothing)
  tests/employee_id_signup_check.sql  Same, for Employee ID sign-up and sign-in (changes nothing)
  tests/egg_tracking_check.sql  Same, for eggs and egg billing (changes nothing)
```

## Database schema

- **employees** — `id, token_no, name, is_active, created_at, updated_at`. `token_no` is the office token number (TKN), unique when set; lists are ordered by it and it's shown beside every name, since several employees share a name.
- **employee_accounts** — `employee_id` (primary key), `user_id` (the login, null until the employee signs up), `employee_code` (the Employee ID they sign in with, unique case-insensitively, null until they sign up, 0018), `phone` (`01XXXXXXXXX`, asked for at sign-up since 0018; optional on older rows). Kept apart from `employees` because that table is public and these details aren't. No client can write `employee_code`: only the sign-up and reset functions do.
- **`employee_signup_check(token, employee_id)`** / **`register_employee_signup(token, name, phone, employee_id)`** / **`register_employee()`** / **`reset_employee_login(employee_id)`** — check a Token Number *and* Employee ID before any login exists; finish a sign-up (link the login to the token's employee, store the Employee ID and phone, update that employee's name — never insert an employee); confirm a login is linked; delete an employee's login and clear their Employee ID (managers only). A signed-up employee's `token_no` and `employee_code` can't change until their login is reset (`guard_employee_token`, `guard_employee_account_code`).
- **egg_records** — `id, period_id, employee_id, meal_date, egg_qty, egg_price, egg_total` (computed by the database), timestamps; unique on `(period_id, employee_id, meal_date)`, so an edit can never charge twice. Eggs are an extra charge and are never part of `meal_records`, so they can't touch a meal count, a meal rate or a meal's status. Each row keeps the price it was saved with, and belongs to one mess month (0019).
- **`get_my_egg_days(month_start)`** — the signed-in employee's own eggs for one mess month, date by date. Answers only for the caller, read-only.
- **`get_my_statement(month_start)`** — the signed-in employee's own deposits, meal bill, egg charge and final bill (and month totals) for one mess month. Answers only for the caller.
- **`get_my_meal_days(month_start)`** — the signed-in employee's own meals for one mess month, day by day, with each day's meal counts, so the Employee Panel can count past meals only. Answers only for the caller.
- **meal_records** — `id, employee_id, meal_date, breakfast, lunch, dinner, created_at, updated_at`, unique on `(employee_id, meal_date)`, indexed on both `employee_id` and `meal_date`
- **meal_cutoffs** — one row: `breakfast_cutoff, lunch_cutoff, dinner_cutoff` (`time`, Bangladesh time) — the employee meal deadlines.
- **`meal_lock_reason(date, meal, now)`** / **`enforce_meal_cutoffs()`** — the deadline rule and the `meal_records` trigger that enforces it for everyone but mess managers.
- **admin_profiles** — `id` (references `auth.users`), `full_name` (e.g. "January2026"). A row here means "is a mess manager account".
- **mess_periods** — `manager_id` (unique), `start_date` + `start_meal` (the first meal: 5th, `lunch`), `end_date` + `end_meal` (the last meal: next 5th, `breakfast`), both inclusive; `first_slot` / `last_slot` (generated: those meals' slots), `meal_rate` / `published_meal_rate`. Each account manages exactly one month. An exclusion constraint on the slot range stops any meal belonging to two periods. See [Manager periods](#manager-periods).
- **meal_day_weights** — `period_id, meal_date, breakfast_weight, lunch_weight, dinner_weight`. One row per customised date; a missing row means the defaults 0.75 / 1.25 / 1.00. The date must be inside the period; on the 5th each period has its own row, and only its own meals' counts are used.
- **deposits** — `period_id, employee_id, amount (> 0), deposited_on, note`. Any number per employee. An employee with deposits can't be hard-deleted (deactivate instead).
- **guest_meals** — primary key `(period_id, meal_date)`, `breakfast_guests, lunch_guests, dinner_guests` (whole numbers 0–10,000), `updated_at`. One row per month and date; a trigger (`guard_guest_meal_owner`) keeps each row to its own month's meals, so a date + meal has exactly one guest count even on the 5th. No row means no guests. No bills are stored.
- **spending_records** — `id, period_id, spent_on, person_name (1–80 chars), amount (> 0), created_at, updated_at`. Any number per date. The date must be inside the period; managers can change only the date, name and amount, never move an entry to another month.
- **`get_today_guest_meals()`** — today's three guest counts (Asia/Dhaka) for the cook's public meal board, and nothing else: no other date, no bills.
- **`get_spending_total(period_id)`** — "Sum Spending": the number of entries and their total, added up from the rows. Zero for a period the caller doesn't own.
- **`register_mess_manager()`** — run right after signup. Reads the month from the caller's own login address and creates their profile and period, so an account can only ever manage the month in its own username.
- **`get_period_report(period_id)`** — per employee: meal counts, weighted meal count, bill, total deposit, balance, counting exactly the period's own meals. Lists active employees plus anyone who ate or deposited that month (so people who joined or left mid-month are included). Returns nothing for a period the caller doesn't own.
- **`private.meal_slot(date, meal)`** — every meal as one number in time order: days since 2000-01-01 × 3 + 0 (breakfast) / 1 (lunch) / 2 (dinner).
- **`private.get_meal_period(date, meal)`** — whose meal is this: the id of the one period owning it (null if no manager has that month yet). The single answer every rule below uses.
- **`private.period_status(start, end)`** — `upcoming` / `active` / `completed`: whether a period is open for changing employee meals (00:00 on its first day to 23:59 on its last, Bangladesh time).
- **`private.manager_can_change_meal(date, meal)`** / **`private.manager_can_change_date(date)`** — may the signed-in manager change this meal (their own period owns it and is active) / any meal of this date. Used by RLS and the trigger below.
- **`enforce_manager_meal_period()`** — the `meal_records` trigger that rejects any change to a meal the manager may not change (`MANAGER_PERIOD`).
- **`get_my_meal_access(date)`** — for the Mess Manager Panel: the caller's period status and, for one date, which meals are theirs and which they may change right now.
- **`private.is_admin()`** — SQL helper used by RLS policies ("is the caller a mess manager?").

See `supabase/migrations/` for the full, commented definitions.

## Security model (Row Level Security)

Enforced in Postgres, not just hidden in the UI:

| Table | Public (anon) | Employee (signed in) | Mess manager |
|---|---|---|---|
| `employees` | read only | read only | full CRUD (shared) |
| `employee_accounts` | **no access** | read own row | read all |
| `meal_records` | read only | read; write **own** row within the meal deadlines | read; write / delete only the meals of **their own running period** (see [Manager periods](#manager-periods)) |
| `meal_cutoffs` | read only | read only | read + update (shared) |
| `mess_periods` | **no access** | **no access** (own bill via `get_my_statement`) | read own row; update only `meal_rate` / `published_meal_rate` — never its dates or meals; no insert or delete |
| `meal_day_weights` | **no access** | **no access** (own bill via `get_my_statement`) | own period's dates only |
| `deposits` | **no access** | **no access** (own deposits via `get_my_statement`) | own period only (add / remove) |
| `guest_meals` | **no access** (the meal board gets today's counts via `get_today_guest_meals`) | **no access** | own period's dates and meals only (add / change / remove) |
| `spending_records` | **no access** | **no access** | own period's dates only (add / change / remove) |
| `egg_records` | **no access** | read **own** rows only; no write at all | own period's dates only (add / change / remove) |
| `admin_profiles` | no access | no access | read own row only |

Month accounts can't see each other's periods, meal counts, deposits,
meal rate, guests, spending, reports, or profiles — January2026 and
February2026 each see only their own month. This is enforced by RLS in the
database, so changing a URL or ID, or calling the Supabase API directly,
returns nothing.

Nobody signed out can change a meal: `meal_records` is readable by anyone
(the cook's board needs it) but writable only by a signed-in employee for
their own row, or by a mess manager for their own running period's meals.
An employee can't see anyone else's bill, deposits, or eggs, or anyone's
phone number or Employee ID. Employees can read their own egg charges but
have no write policy on `egg_records` at all, so only a mess manager can
change an egg quantity or price.

### Manager periods

Each mess month has one manager account, and its **manager period** runs
meal by meal from the **5th's lunch** through the **next month's 5th
breakfast**:

| Meal | Belongs to |
|---|---|
| 4 Sep dinner, 5 Sep breakfast | August's manager |
| 5 Sep lunch, 5 Sep dinner, 6 Sep … 4 Oct, 5 Oct breakfast | September's manager |
| 5 Oct lunch, 5 Oct dinner, 6 Oct breakfast … | October's manager |

Every meal belongs to exactly one period. A month owns 3 meals × its number
of days (28, 29, 30 or 31), meeting the next month with no gap or overlap —
calendar dates, never "30 days", so December → January, February and leap
years need nothing special.

**Stored explicitly.** `mess_periods` names the first and last meal:
`start_date` + `start_meal` (5 Sep, lunch) and `end_date` + `end_meal`
(5 Oct, breakfast), both inclusive. Each meal also has a number in time
order, its *slot* (`private.meal_slot`), and `first_slot` / `last_slot` are
generated from those columns; an exclusion constraint on the slot range
means no meal can ever belong to two periods.

**One answer to "whose meal is this?"** — `private.get_meal_period(date,
meal)`. Everything else uses it or the same slots: who may change a meal,
which meals a bill counts, which month's meal counts apply on the 5th, and
whose guests are whose. The app never works it out itself: pages ask the
database (`get_my_meal_access`) what the signed-in manager may do.

**Who may change an employee's meal ON/OFF.** Only the manager whose own
period owns that meal, and only while that period is running: from 00:00
on its first day to 23:59 on its last day, Bangladesh time
(`private.period_status`: upcoming → active → completed). On the 5th both
managers are running, each for their own meals only — the outgoing manager
for breakfast, the incoming one for lunch and dinner. Enforced in Postgres
whatever sends the request (the app, a changed URL, form or server action,
or a hand-made Supabase/REST call with any employee id, period id or date):

- **RLS** on `meal_records` lets a manager insert, update or delete a row
  only on a date where their running period owns at least one meal;
- the **`enforce_manager_meal_period` trigger** then checks each meal the
  write actually changes and rejects the whole write if any one isn't
  theirs (a delete counts as turning every ON meal off);
- the period itself is out of reach: managers can update only
  `meal_rate` / `published_meal_rate` on `mess_periods` — never its dates
  or meals — and can't insert or delete periods.

Nothing is taken from the request: the period comes from the signed-in
login (`auth.uid()` → its one `mess_periods` row).

**When a period ends**, nothing is locked or deleted. The manager keeps
signing in and keeps everything about their month: its meals (read-only),
meal counts, deposits (cash collection), dues, meal rate (test and
publish), guests, spending, report, CSV export and calculations. Only
changing employees' meal ON/OFF stops. Meal Status then says: "Your manager
period has ended. Your management period was: 5 September 2026 Lunch → 5
October 2026 Breakfast. Employee meal-status updates are now handled by the
October 2026 manager. You can still access your previous period's meal
records, calculations, cash collection, reports, and other historical
information." — and every meal shows 🔒. Before a period starts, Meal Status
says so, and its meals are 🔒 until its first day. On the 5th, the other
month's meals are 🔒 with a note saying whose they are.

**The next manager** changes only their own period's meals; they can read
other dates' meal ON/OFF (as every manager can) but can't change them, and
can't see another month's meal counts, deposits, rate, guests, spending or
report.

**Bills count exactly the period's own meals** (`get_period_report`,
`get_dashboard_stats`, `get_my_statement`, `get_my_meal_days`): 5 Oct
breakfast is on September's bill, at September's meal count for 5 Oct; 5
Oct lunch and dinner are on October's. Each month keeps its own meal-count
row and guest row for the 5th. Spending dated the 5th can be recorded in
either month.

**Employees are unaffected**: their deadlines and panel don't change.

**No account change deletes business data.** Deleting a manager's login
used to cascade (login → profile → period → meal counts, deposits, guests,
spending). Every such foreign key is now `ON DELETE RESTRICT` (0015), so the
delete fails instead: a login can't be deleted while its manager profile
exists, a profile while its period exists, a period while it has meal
counts, deposits, guests or spending, and an employee while they have meals.
To stop someone signing in, change the account's password (or ban the user)
in Supabase Dashboard → Authentication → Users; neither removes anything.
Nothing in the app ever deletes a previous month, manager, period or its
history.

### Meal deadlines

Employees (signed in to the Employee Panel) can change their own meals:

| Date | Breakfast / Lunch / Dinner |
|---|---|
| Before today | 🔒 never |
| Today | ✅ until that meal's deadline, 🔒 from the deadline on |
| After today | ✅ always (the deadline applies once that day is today) |

Mess managers aren't bound by the deadlines, but change only the meals
of their own running manager period ([Manager periods](#manager-periods)).
Deadlines default to 08:00 / 11:00 / 17:00 and are set under Meal Status →
Employee meal deadlines (one office-wide setting, table `meal_cutoffs`).

Enforced in Postgres, not only on screen: the `enforce_meal_cutoffs`
trigger on `meal_records` (migration 0009) rejects a locked change however
it's sent — the app, or a hand-made Supabase/REST request. "Today" and the
time are always Bangladesh time (`Asia/Dhaka`), never the server's or
phone's. The Employee Panel mirrors the rule (`src/lib/utils/cutoffs.ts`)
to show 🔒 on locked meals, and re-checks every 15 seconds, so a meal locks
on screen as its deadline passes without a reload. That on-screen clock
follows the server's time, so a phone set to the wrong time still shows the
right locks.

To confirm the deadlines are enforced on your Supabase project, paste
`supabase/tests/meal_cutoffs_check.sql` into the SQL Editor and run it: one
row per check (employee vs. manager, before/after cut-off, previous/future
days, midnight in Asia/Dhaka), all should say PASS. It changes nothing —
every check is rolled back.

`supabase/tests/guest_spending_check.sql` does the same for guest meals
and spending (migration 0014): 1 / 100 / 150 guests, several meals on one
date, no second record for a date, dates outside the month refused, several
spending entries per date, the month total (3,000 + 2,500 + 1,200 + 4,000 =
10,700), edits and deletes, months kept apart, and employees, other months'
managers and signed-out visitors refused. All should say PASS.

`supabase/tests/employee_id_signup_check.sql` does the same for sign-up and
sign-in (migration 0018): an unknown or deactivated token refused, a token
that already signed up refused, an Employee ID another employee uses
refused, a malformed Employee ID or phone number refused, sign-up linking
the login and storing the Employee ID, phone and name without ever adding
an employee record, a login only ever claiming the Employee ID it was
created with, managers unable to write an Employee ID, and **Reset login**
clearing the login and Employee ID while keeping the employee and phone.

`supabase/tests/egg_tracking_check.sql` does the same for eggs (migration
0019): quantity × price, no final bill before the meal rate is set, the
final bill being meal cost + egg cost once it is, eggs never changing the
meal count or any meal's status, no double charge when a quantity is saved
again, dates and months outside the manager's own refused, each month
keeping its own eggs, employees reading only their own and never writing,
signed-out visitors refused, and a price change never re-pricing eggs
already recorded.

`supabase/tests/manager_periods_check.sql` does the same for manager
periods (migration 0015): whose meal each boundary meal is (5 Sep breakfast
→ August, 5 Sep lunch → September, 5 Oct breakfast → September, 5 Oct lunch
→ October, …), December → January, February and leap years, when a period
opens and closes (to the second, Bangladesh time), who may change which
meal at exact moments, real writes through RLS and the trigger by the
current, previous and next month's managers, a finished manager keeping
everything but meal changes, bills counting each meal exactly once, guests,
meal counts and spending on the 5th, and that deleting logins, profiles,
periods or employees is blocked with nothing deleted. All should say PASS.

### Employee accounts

1. The mess manager adds the employee with their Token Number under
   **Employees** (as before; tokens are unique).
2. The employee opens `/employee/signup` and enters their full name, Token
   Number, Employee ID, phone number and a password twice (at least 6
   characters), and is signed straight in. Sign-up only works for a token
   on the employee list, only for an active employee, and only once per
   token — an unknown token is refused with *"Invalid token number. Please
   contact the Mess Manager."* The Employee ID must be free (letters,
   digits, `-` and `_`), and the phone number a Bangladesh mobile number.
   The name typed here replaces that employee's name on the list, and the
   Employee ID and phone number are stored on their account — no second
   employee record is ever created.
3. After that they sign in at `/employee/login` with their **Employee ID**
   and password. The Token Number is no longer a login: it is what
   authorises the sign-up and links the account to the employee record.

Like the month logins below, each Employee ID maps to a fixed internal
login address — `EMP-1024` → `emp-id-emp-1024@mess-manager.app`
(`employeeAccountEmail()` in `src/lib/utils/employee-id.ts`), so an ID is
case-insensitive. Nobody types or sees that address, and no mail or SMS is
ever sent. Employees who had signed up before migration 0018 were moved to
such an address and keep their password; their Employee ID is their token
number until a manager resets their login.

**Forgotten password, or the wrong person signed up with a token**: the
manager presses **Reset login** beside the employee. That deletes the
login and clears their Employee ID (not the employee, meals, eggs, or
deposits), and the employee signs up again with a new password. A
signed-up employee's token and Employee ID can't be changed until their
login is reset.

**Deactivated employees** can't sign up, and if already signed up they can
still sign in but can't change meals or see their bill until reactivated.

Signup checks the token first (`employee_signup_status`), which tells a
signed-out visitor whether a token is on the employee list — the same
thing the signup error message has to say anyway. Token numbers aren't
secret (the meal board shows them), so an employee's token can be claimed
by whoever signs up with it first: the Employees tab shows who has signed
up, and **Reset login** undoes a wrong sign-up.

**Many people signing in at once**: Supabase Auth limits how many
sign-ins it accepts per server address, and every sign-in here comes from
the app's server. The project's limits are raised to **200 per 5 minutes**
for sign-ups/sign-ins and for token refreshes (Supabase Dashboard →
Authentication → Rate Limits), enough for the whole office at once. If the
limit is still hit, the sign-in and sign-up forms say "Too many people are
signing in right now. Please wait a minute and try again." instead of a
wrong-password error (`src/lib/auth/errors.ts`).

### Month-name logins

Supabase Auth logs in by email, so each month username maps to a fixed
internal address: `January2026` → `mess-2026-01@mess-manager.app`
(`messAccountEmail()` in `src/lib/utils/mess.ts`). Nobody types or sees it,
and no mail is sent to it. Supabase's unique email rule is what makes each
month name single-use.

The whole monthly team (~5 people) shares that one login.

Signup is **open**: anyone with the link to `/admin/signup` can take a month
nobody has taken yet, without a verified email. They can't see anyone
else's data, but can edit the shared employee list. There's no "forgot
password" — to reset a manager's password, change it for their
`mess-YYYY-MM@mess-manager.app` user in Supabase Dashboard →
Authentication → Users.

The app never uses the Supabase **service_role** key anywhere — all access,
public and admin, goes through the anon key and is governed entirely by
these RLS policies plus the user's session.

## Setup — what you need to configure

1. **Create a Supabase project** at https://supabase.com (free tier is fine).
2. **Run the schema migration**: open the SQL Editor in your Supabase
   project and run the contents of `supabase/migrations/0001_init_schema.sql`,
   followed by every other file in `supabase/migrations/` in number order.
   If you use the Supabase CLI instead: `supabase link` then
   `supabase db push`.
3. **Turn off email confirmation**: Supabase Dashboard → Authentication →
   Sign In / Providers → Email → **Confirm email** off. Month and employee
   logins use internal addresses that can't receive mail, so signup fails
   while this is on.
4. **Each monthly team signs up once** — visit `/admin/signup`, enter the
   account name (e.g. `January2026`) and a password, and share them with the
   team.
5. **Environment variables**: copy `.env.example` to `.env.local` and fill
   in your project's URL and anon key (Project Settings → API):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```
   Never put the `service_role` key anywhere in this app.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the meal board, http://localhost:3000/employee
for the Employee Panel (sign-in required), and
http://localhost:3000/admin for the mess manager panel.

## Build / lint

```bash
npm run build
npm run lint
```

## Deploy

Any Next.js host works (Vercel is the simplest). Set the two
`NEXT_PUBLIC_SUPABASE_*` environment variables in your hosting provider's
project settings, then deploy. In Supabase, add your production domain
under Authentication → URL Configuration if you use email links (not
required for the plain email/password flow used here).

## Performance notes

- **Region**: `vercel.json` pins the app's server functions to Tokyo
  (`hnd1`), next to the Supabase project (`ap-northeast-1`). Every page makes
  several database round trips, so keeping them in the same region matters
  more than anything else.
- **Auth**: the proxy and pages verify the session with `getClaims()` (local
  JWT check) rather than a call to Supabase Auth. That is only local when the
  Supabase project uses **asymmetric JWT signing keys** (Project Settings →
  JWT Keys). With the legacy shared secret, `getClaims()` silently falls
  back to a network call to Supabase Auth, twice per admin page (proxy +
  layout) — migrate the project to signing keys if admin pages feel slow.
- **Session lookup**: the profile and its mess month come back in one query
  (`admin_profiles` with `mess_periods` embedded), run in parallel with the
  JWT check and cached per request, so layout, page, and server actions
  share it.
- **Meal sheets**: each employee's meal record for the day is embedded in
  the employees query — one query for the meal board, two (plus the
  day's meal counts) for Meal Status. The meal board uses a cookie-less
  anon client, so a signed-in manager's session is never refreshed just to
  render public data.
- **Report filter** runs in the browser on rows the page already has; it
  updates `?employee=` without re-running the report query.
- **Narrow selects**: pages fetch only the columns they render (e.g. the
  Employees and deposit lists).
- **Static signup page**: `/admin/signup` has no per-request data, so it's
  prerendered and served from the CDN.
- **Heavy lifting in Postgres**: the report (`get_period_report`) and the
  dashboard (`get_dashboard_stats`) are aggregated in the database; the
  browser only receives one row per employee / one summary row.
- **Meal ON/OFF** is written straight from the browser to Supabase (RLS
  allows it) and updates only that row on screen — no page reload, and
  several taps save in parallel.
- **No double fetches**: server actions that change data call
  `revalidatePath`, which already re-renders the page; the UI never also
  calls `router.refresh()`. (Meal Status refreshes only when the database
  refuses a meal change — e.g. the period ended while the page was open —
  to reload the locks.)
- **RLS** uses `(select auth.uid())` so it's evaluated once per query, not
  once per row.

## Notes / intentional design decisions

- **Timezone**: all "today" logic uses Asia/Dhaka regardless of server or
  visitor location, so the office's calendar day is always correct.
- **Employee deletion**: an employee can only be hard-deleted if they have
  no meal history and no deposits (to protect billing records; the database
  refuses it too). Otherwise, deactivate them — they disappear from the
  Employee Panel but stay in any month's report where they ate or deposited.
- **Handover day**: a manager period is open for meal changes for its
  whole first and last day (the 5ths), each manager only for their own
  meals of that day, rather than switching over at a clock time.
- **CSV export**: monthly reports export as CSV, which opens directly in
  Excel, Google Sheets, and Numbers.

## Still to configure before going live

- [ ] Create the Supabase project and run the migrations above (for guests and spending: `0014_guest_meals_spending.sql`; for manager periods: `0015_manager_meal_periods.sql` and `0016_guest_trigger_invoker.sql`; for Employee ID sign-in and eggs: `0018_employee_id_signup.sql` and `0019_egg_tracking.sql`)
- [ ] Turn off "Confirm email" in Supabase Authentication settings
- [ ] Each monthly team signs up once at `/admin/signup` (account name = month, e.g. `January2026`)
- [ ] Add real employees, with their Token Numbers, via `/admin/employees`
- [ ] Ask each employee to sign up once at `/employee/signup` (name, token, Employee ID, phone, password)
- [ ] Set the month's **price per egg** under **Meal Status** if the mess charges for eggs
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your deployment host
