# Office Meal Manager

A mobile-first office meal management app with two panels:

- **Public panel** (`/`) — no login. Anyone with the link can see and toggle
  everyone's breakfast/lunch/dinner status for any date. No prices or money
  ever appear here.
- **Admin panel** (`/admin`) — requires Supabase Auth + an explicit admin
  role. Manage employees, edit any day's meals, configure prices, and run
  monthly cost reports with CSV export.

Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase
(Postgres + Auth + Row Level Security).

## How it's organized

```
src/
  app/
    page.tsx                 Public meal sheet
    admin/
      login/page.tsx         Admin sign-in (public route)
      (protected)/           Everything below requires an admin session
        page.tsx              Dashboard
        employees/page.tsx    Employee management
        meals/page.tsx        Edit any date's meals
        prices/page.tsx       Meal price configuration + history
        reports/page.tsx      Monthly report + CSV export
  components/
    public/                  Public panel UI (date nav, meal toggle, sheet table)
    admin/                   Admin UI (nav, forms, tables)
  lib/
    supabase/                Browser/server Supabase clients + auth middleware helper
    data/                    Read-only data fetching (server-only)
    actions/                 "use server" mutations (meals, employees, prices, auth)
    auth/                    Admin session/role resolution
    utils/                   Date (Asia/Dhaka) and currency (BDT) helpers
    types/database.ts        Hand-written types mirroring the SQL schema
  proxy.ts                   Next.js 16 "Proxy" (formerly middleware) — session refresh + /admin gate
supabase/
  migrations/0001_init_schema.sql   Full schema, indexes, triggers, RLS policies
  seed.sql                          Optional starter meal prices
```

## Database schema

- **employees** — `id, name, is_active, created_at, updated_at`
- **meal_records** — `id, employee_id, meal_date, breakfast, lunch, dinner, created_at, updated_at`, unique on `(employee_id, meal_date)`, indexed on both `employee_id` and `meal_date`
- **meal_prices** — price *history*: `breakfast_price, lunch_price, dinner_price, effective_from`. Updating prices inserts a new row rather than overwriting, so monthly reports for past months keep using whatever price was in effect on each day.
- **admin_profiles** — `id` (references `auth.users`), `role`. This is the only source of admin authorization — signing in with Supabase Auth alone grants nothing.
- **First-admin bootstrap** — `private.claim_first_admin()` lets a signed-in user become admin *only* while `admin_profiles` is empty (guarded by an exclusive table lock, so concurrent claims can't both win). `public.admin_setup_completed()` exposes a single boolean so the signup page knows whether to open.
- **`is_admin()`** — SQL helper used by RLS policies.
- **`get_monthly_report(year, month)`** — server-side aggregation that joins each day's meal records to the price in effect that day and returns per-employee counts/amounts.

See `supabase/migrations/0001_init_schema.sql` for the full, commented definition.

## Security model (Row Level Security)

Enforced in Postgres, not just hidden in the UI:

| Table | Public (anon) | Admin (authenticated + admin_profiles row) |
|---|---|---|
| `employees` | read only | full CRUD |
| `meal_records` | read + write (by design — see below) | full CRUD |
| `meal_prices` | **no access** | full CRUD |
| `admin_profiles` | no access | read own row only |

`meal_records` is intentionally publicly writable: the product requirement
is that any employee, without logging in, can toggle anyone's meal status.
That table holds no financial data, so this carries no money/price
exposure. Every other table (prices, admin roles) is locked to admins only,
verified via the `is_admin()` function inside RLS policies — a user cannot
become an admin by editing frontend code.

The app never uses the Supabase **service_role** key anywhere — all access,
public and admin, goes through the anon key and is governed entirely by
these RLS policies plus the user's session.

## Setup — what you need to configure

1. **Create a Supabase project** at https://supabase.com (free tier is fine).
2. **Run the schema migration**: open the SQL Editor in your Supabase
   project and run the contents of `supabase/migrations/0001_init_schema.sql`,
   then optionally `supabase/seed.sql` for starter prices (৳30/৳50/৳40 —
   edit these first if your real prices differ). If you use the Supabase
   CLI instead: `supabase link` then `supabase db push`.
3. **Create your first admin** — visit `/admin/signup` and fill in the form.
   This is a **one-time bootstrap**: the page is only open while zero admins
   exist, and the moment the first admin is created it closes permanently.
   The rule is enforced in the database (`private.claim_first_admin` takes an
   exclusive lock and refuses if any admin row exists), not in the UI, so it
   can't be bypassed by calling the API directly.

   If your Supabase project has "Confirm email" enabled, signup creates the
   account but can't grant admin inline — confirm the email, sign in, and
   `/admin` will offer a "Claim admin access" button while the slot is open.

   To add **more** admins later, create the user in Supabase Dashboard →
   Authentication → Users, then in the SQL Editor run:
   ```sql
   insert into public.admin_profiles (id, full_name)
   values ('<the user''s UUID from the Users list>', 'Their Name');
   ```
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
http://localhost:3000/admin for the admin panel.

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

- [ ] Create the Supabase project and run the migration + seed above
- [ ] Set real meal prices (via `/admin/prices` or by editing `seed.sql` first)
- [ ] Create your first admin at `/admin/signup` (one-time; closes afterwards)
- [ ] Add real employees via `/admin/employees`
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your deployment host
