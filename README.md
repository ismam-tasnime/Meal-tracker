# Office Meal Manager

A mobile-first office meal management app with two panels:

- **Public panel** (`/`) — no login. Anyone with the link can see and toggle
  everyone's breakfast/lunch/dinner status for any date. No prices or money
  ever appear here.
- **Mess manager panel** (`/admin`) — requires a mess manager account. The
  mess runs in months from the 5th to the 4th of the next month (e.g.
  5 Jan – 4 Feb), with a different manager each month. Anyone can sign up as
  a mess manager at `/admin/signup` and pick the month they manage; each
  manager's dashboard, prices, and reports are private to them. Managers can
  also manage the shared employee list and edit meals within their month.

Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase
(Postgres + Auth + Row Level Security).

## How it's organized

```
src/
  app/
    page.tsx                 Public meal sheet
    admin/
      login/page.tsx         Mess manager sign-in (public route)
      signup/page.tsx        Mess manager sign-up (public route)
      (protected)/           Everything below requires a mess manager session
        page.tsx              Dashboard for the selected mess month
        employees/page.tsx    Employee management (shared by all managers)
        meals/page.tsx        Edit meals for days in your mess month
        prices/page.tsx       Your mess month's prices + history
        reports/page.tsx      Your mess month's report + CSV export
        periods/page.tsx      "My months" — add/remove the months you manage
  components/
    public/                  Public panel UI (date nav, meal toggle, sheet table)
    admin/                   Mess manager UI (nav, forms, tables)
  lib/
    supabase/                Browser/server Supabase clients + auth middleware helper
    data/                    Read-only data fetching (server-only)
    actions/                 "use server" mutations (meals, employees, prices, auth)
    auth/                    Mess manager session/role resolution
    utils/                   Date (Asia/Dhaka), mess month (5th–5th), and currency (BDT) helpers
    types/database.ts        Hand-written types mirroring the SQL schema
  proxy.ts                   Next.js 16 "Proxy" (formerly middleware) — session refresh + /admin gate
supabase/
  migrations/                 Run in order: 0001 schema … 0005 mess managers
```

## Database schema

- **employees** — `id, name, is_active, created_at, updated_at`
- **meal_records** — `id, employee_id, meal_date, breakfast, lunch, dinner, created_at, updated_at`, unique on `(employee_id, meal_date)`, indexed on both `employee_id` and `meal_date`
- **admin_profiles** — `id` (references `auth.users`), `full_name`. A row here means "is a mess manager". Users create their own row when they sign up.
- **mess_periods** — `manager_id, start_date, end_date` (end exclusive). One row per mess month a manager runs. An exclusion constraint stops two periods from overlapping, so each month has exactly one manager.
- **meal_prices** — price *history* per period: `period_id, breakfast_price, lunch_price, dinner_price, effective_from`. Changing prices inserts a new row, so earlier days keep the price in effect then. `effective_from` must fall inside the period.
- **`register_mess_manager(name, start, end)`** — creates the caller's manager profile and first period in one transaction.
- **`get_period_report(period_id)`** — per-employee meal counts and amounts for one period, priced with that period's prices. Returns nothing for a period the caller doesn't own.
- **`private.is_admin()`** — SQL helper used by RLS policies ("is the caller a mess manager?").

See `supabase/migrations/` for the full, commented definitions.

## Security model (Row Level Security)

Enforced in Postgres, not just hidden in the UI:

| Table | Public (anon) | Mess manager |
|---|---|---|
| `employees` | read only | full CRUD (shared) |
| `meal_records` | read + write (by design — see below) | read + write; delete only inside own periods |
| `mess_periods` | **no access** | own rows only |
| `meal_prices` | **no access** | only rows of own periods |
| `admin_profiles` | no access | create + read own row only |

Managers can't see each other's periods, prices, reports, or profiles —
the January manager and the February manager each see only their own
month, enforced by RLS rather than the UI.

`meal_records` is intentionally publicly writable: the product requirement
is that any employee, without logging in, can toggle anyone's meal status.
That table holds no financial data, so this carries no money/price
exposure. Prices and periods are locked to the manager who owns them.

Mess manager signup is **open**: anyone with the link to `/admin/signup`
can create a manager account. A new manager can't see anyone else's data,
but can edit the shared employee list and claim a month nobody has taken
yet.

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
3. **Mess managers sign up** — each manager visits `/admin/signup`, enters
   their name, email, password, and the month they manage. They set their
   own meal prices under Prices. A manager who runs more than one month adds
   it under "My months".

   If your Supabase project has "Confirm email" enabled, signup creates the
   account but can't finish registration inline — confirm the email, sign
   in, and `/admin` asks for the mess month again.

   Upgrading from the single-admin version: the existing admin stays a mess
   manager and is asked to pick their month on next sign-in. Prices set
   before the upgrade aren't tied to any month, so re-enter them on the
   Prices page.
4. **Environment variables**: copy `.env.example` to `.env.local` and fill
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

Open http://localhost:3000 for the public panel and
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

## Notes / intentional design decisions

- **Timezone**: all "today" logic uses Asia/Dhaka regardless of server or
  visitor location, so the office's calendar day is always correct.
- **Identifying your own row**: since the public panel has no login, each
  device can locally remember "which employee am I" (stored only in that
  browser's `localStorage`) to highlight your row. This is a convenience,
  not an identity system — anyone can still edit anyone's row, by design.
- **Employee deletion**: an employee can only be hard-deleted if they have
  zero meal history (to protect past billing records). Otherwise, deactivate
  them — they disappear from the public sheet but stay in reports.
- **CSV export**: monthly reports export as CSV, which opens directly in
  Excel, Google Sheets, and Numbers.

## Still to configure before going live

- [ ] Create the Supabase project and run the migrations above
- [ ] Each mess manager signs up at `/admin/signup` and sets their month's prices
- [ ] Add real employees via `/admin/employees`
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your deployment host
