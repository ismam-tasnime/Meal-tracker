# Meal Tracker

A mobile-first office meal management app. The landing page (`/`) is a
read-only board of today's meals for the cook: plate counts per meal and a
tick beside everyone who is eating, with no buttons to press. It refreshes
itself every minute. The header links to the two panels:

- **Employee Panel** (`/employee`) — each employee signs in with their own
  phone number and password, and sees only their own things. Nobody can
  change anyone else's meals. See [Employee accounts](#employee-accounts).
  - **My meals** — their breakfast/lunch/dinner ON/OFF for any date,
    changeable within the meal deadlines (see below). Past days are locked,
    and the deadlines are shown but only a mess manager can change them.
  - **Meals I had** — for any mess month, how many breakfasts, lunches and
    dinners they have already had; tapping one lists the dates (read-only,
    🔒). Past meals only: a meal counts once its day is over or today's
    deadline has passed, so upcoming meals switched ON don't count yet.
  - **My deposit** — the month's total and each deposit.
  - **Bill calculator** — a **Dummy meal rate** box: type any rate to see
    the bill it would give for their past meals (meal count × rate) and what
    they'd pay or get back against their deposit. The dummy
    rate never leaves the employee's phone: it isn't sent to the server or
    saved in the database, and has no connection to the manager's rate. The
    phone remembers it under that employee's own account (so on a shared
    phone another employee never sees it), and signing out erases it
    (`src/lib/dummy-rate.ts`). The mess manager's real meal rate and bill
    are never shown in the Employee Panel, before or after the manager sets
    them.
- **Mess Manager Panel** (`/admin`) — one account per mess month, shared by
  that month's team (~5 people). The mess runs from the 5th to the 4th of
  the next month (e.g. 5 Jan – 4 Feb). The team signs up once at
  `/admin/signup` with the account name `January2026` and a password; each
  month can have only one account. Each month's data is private to its
  team. Tabs:
  - **Meal Status** — pick a date, set that date's meal counts
    (Breakfast 0.75 / Lunch 1.25 / Dinner 1.00 by default), and see or fix
    every employee's ON/OFF — any date, any time; the employee deadlines
    don't apply here. Also where the employee meal deadlines are set.
  - **Expense Status** — record deposits (any number per employee, before
    or during the month, or none) and set the month-end meal rate.
  - **Report** — Employee → Meal Count → Total Bill → Total Deposit →
    Amount to be Paid, with CSV export.
  - **Employees** — shared employee list (add, rename, deactivate), each
    employee's phone number, and a **Reset login** button.

## How the money works

```
daily meal count   = breakfast ON × breakfast count + lunch ON × lunch count + dinner ON × dinner count
monthly meal count = sum of daily meal counts over the mess month
total bill         = monthly meal count × meal rate
balance            = total deposit − total bill
                     > 0 → remaining (refund) · = 0 → fully settled · < 0 → due
```

Meal counts are stored once per date (`meal_day_weights`), not per
employee, so changing a date's lunch count instantly updates everyone who
had lunch that day.

Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase
(Postgres + Auth + Row Level Security).

## How it's organized

```
src/
  app/
    page.tsx                 Landing page: today's read-only meal board (cook's view)
    employee/
      page.tsx               Employee Panel: my meals (ON/OFF) + my bill, signed-in employees only
      login/page.tsx         Employee sign-in (phone + password, public route)
      signup/page.tsx        Employee sign-up (public route)
    admin/
      login/page.tsx         Mess manager sign-in (public route)
      signup/page.tsx        Mess manager sign-up (public route)
      (protected)/           Everything below requires a mess manager session
        page.tsx              Dashboard for your mess month
        meals/page.tsx        Meal Status: per-date meal counts + employee ON/OFF
        expenses/page.tsx     Expense Status: deposits + meal rate + balances
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
    utils/                   Date (Asia/Dhaka), mess month (5th–5th), currency (BDT), and phone helpers
    types/database.ts        Hand-written types mirroring the SQL schema
  proxy.ts                   Next.js 16 "Proxy" (formerly middleware) — session refresh + /admin and /employee gates
supabase/
  migrations/                 Run in order: 0001 schema … 0011 employee meal days
  tests/meal_cutoffs_check.sql  Paste into the SQL Editor to verify meal deadlines (changes nothing)
```

## Database schema

- **employees** — `id, token_no, name, is_active, created_at, updated_at`. `token_no` is the office token number (TKN), unique when set; lists are ordered by it and it's shown beside every name, since several employees share a name.
- **employee_accounts** — `employee_id` (primary key), `phone` (unique, `01XXXXXXXXX`), `user_id` (the login, null until the employee signs up). Kept apart from `employees` because that table is public and phone numbers aren't.
- **`register_employee()`** / **`employee_signup_status(phone)`** / **`reset_employee_login(employee_id)`** — link a new login to the employee with its phone number; check a number before signup; delete an employee's login (managers only).
- **`get_my_statement(month_start)`** — the signed-in employee's own deposits (and month totals) for one mess month. Answers only for the caller.
- **`get_my_meal_days(month_start)`** — the signed-in employee's own meals for one mess month, day by day, with each day's meal counts, so the Employee Panel can count past meals only. Answers only for the caller.
- **meal_records** — `id, employee_id, meal_date, breakfast, lunch, dinner, created_at, updated_at`, unique on `(employee_id, meal_date)`, indexed on both `employee_id` and `meal_date`
- **meal_cutoffs** — one row: `breakfast_cutoff, lunch_cutoff, dinner_cutoff` (`time`, Bangladesh time) — the employee meal deadlines.
- **`meal_lock_reason(date, meal, now)`** / **`enforce_meal_cutoffs()`** — the deadline rule and the `meal_records` trigger that enforces it for everyone but mess managers.
- **admin_profiles** — `id` (references `auth.users`), `full_name` (e.g. "January2026"). A row here means "is a mess manager account".
- **mess_periods** — `manager_id` (unique), `start_date, end_date` (end exclusive), `meal_rate` (null until set). Each account manages exactly one month. An exclusion constraint stops two periods from overlapping.
- **meal_day_weights** — `period_id, meal_date, breakfast_weight, lunch_weight, dinner_weight`. One row per customised date; a missing row means the defaults 0.75 / 1.25 / 1.00. The date must be inside the period.
- **deposits** — `period_id, employee_id, amount (> 0), deposited_on, note`. Any number per employee. An employee with deposits can't be hard-deleted (deactivate instead).
- **`register_mess_manager()`** — run right after signup. Reads the month from the caller's own login address and creates their profile and period, so an account can only ever manage the month in its own username.
- **`get_period_report(period_id)`** — per employee: meal counts, weighted meal count, bill, total deposit, balance. Lists active employees plus anyone who ate or deposited that month (so people who joined or left mid-month are included). Returns nothing for a period the caller doesn't own.
- **`private.owns_period()` / `private.date_in_period()`** — RLS helpers: is this period the caller's, and is this date inside it?
- **`private.is_admin()`** — SQL helper used by RLS policies ("is the caller a mess manager?").

See `supabase/migrations/` for the full, commented definitions.

## Security model (Row Level Security)

Enforced in Postgres, not just hidden in the UI:

| Table | Public (anon) | Employee (signed in) | Mess manager |
|---|---|---|---|
| `employees` | read only | read only | full CRUD (shared) |
| `employee_accounts` | **no access** | read own row | read all; add / change phone numbers |
| `meal_records` | read only | read; write **own** row within the meal deadlines | read + write any date, any time; delete only inside own periods |
| `meal_cutoffs` | read only | read only | read + update (shared) |
| `mess_periods` | **no access** | **no access** (own bill via `get_my_statement`) | read own row; update only `meal_rate` |
| `meal_day_weights` | **no access** | **no access** (own bill via `get_my_statement`) | own period's dates only |
| `deposits` | **no access** | **no access** (own deposits via `get_my_statement`) | own period only (add / remove) |
| `admin_profiles` | no access | no access | read own row only |

Month accounts can't see each other's periods, meal counts, deposits,
meal rate, reports, or profiles — January2026 and February2026 each see
only their own month. This is enforced by RLS in the database, so changing
a URL or ID, or calling the Supabase API directly, returns nothing.

Nobody signed out can change a meal: `meal_records` is readable by anyone
(the cook's board needs it) but writable only by a signed-in employee for
their own row, or by a mess manager. An employee can't see anyone else's
bill or deposits, or anyone's phone number.

### Meal deadlines

Employees (signed in to the Employee Panel) can change their own meals:

| Date | Breakfast / Lunch / Dinner |
|---|---|
| Before today | 🔒 never |
| Today | ✅ until that meal's deadline, 🔒 from the deadline on |
| After today | ✅ always (the deadline applies once that day is today) |

Mess managers can change any meal on any date at any time. Deadlines
default to 08:00 / 11:00 / 17:00 and are set under Meal Status → Employee
meal deadlines (one office-wide setting, table `meal_cutoffs`).

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

### Employee accounts

1. The mess manager adds the employee's phone number under **Employees**
   (when adding them, or with **Edit**). Bangladesh mobile numbers only;
   `+880 1712-345678`, `8801712345678` and `01712345678` are all accepted
   and saved as `01712345678`.
2. The employee opens `/employee/signup`, enters that number and a password
   (at least 6 characters), and is signed straight in. Signup only works
   for a number on the employee list, only for an active employee, and
   only once per number.
3. After that they sign in at `/employee/login` with the number and
   password.

Like the month logins below, each phone number maps to a fixed internal
login address — `01712345678` → `emp-01712345678@mess-manager.app`
(`employeeAccountEmail()` in `src/lib/utils/phone.ts`). Nobody types or
sees it, and no mail or SMS is ever sent.

**Forgotten password, or the wrong person signed up with a number**: the
manager presses **Reset login** beside the employee. That deletes the
login (not the employee, meals, or deposits), and the employee signs up
again with a new password. A number that has signed up can't be changed or
removed until its login is reset.

**Deactivated employees** can't sign up, and if already signed up they can
still sign in but can't change meals or see their bill until reactivated.

Signup checks the number first (`employee_signup_status`), which tells a
signed-out visitor whether a number is on the employee list — the same
thing the signup error message has to say anyway.

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
  calls `router.refresh()`.
- **RLS** uses `(select auth.uid())` so it's evaluated once per query, not
  once per row.

## Notes / intentional design decisions

- **Timezone**: all "today" logic uses Asia/Dhaka regardless of server or
  visitor location, so the office's calendar day is always correct.
- **Employee deletion**: an employee can only be hard-deleted if they have
  no meal history and no deposits (to protect billing records). Otherwise,
  deactivate them — they disappear from the Employee Panel but stay in any
  month's report where they ate or deposited.
- **CSV export**: monthly reports export as CSV, which opens directly in
  Excel, Google Sheets, and Numbers.

## Still to configure before going live

- [ ] Create the Supabase project and run the migrations above
- [ ] Turn off "Confirm email" in Supabase Authentication settings
- [ ] Each monthly team signs up once at `/admin/signup` (account name = month, e.g. `January2026`)
- [ ] Add real employees, with their phone numbers, via `/admin/employees`
- [ ] Ask each employee to sign up once at `/employee/signup`
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your deployment host
