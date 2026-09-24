import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { listMyPeriods } from "@/lib/data/periods";
import { AdminNav } from "@/components/admin/AdminNav";
import { NewPeriodForm } from "@/components/admin/NewPeriodForm";
import { RegisterManagerForm } from "@/components/admin/RegisterManagerForm";
import { signOut } from "@/lib/actions/auth";
import { todayInOfficeTz } from "@/lib/utils/date";
import { messMonthForDate } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, profile } = await getAdminSession();

  // Defense in depth: the proxy (middleware) already redirects unauthenticated
  // visitors, but every server render re-checks here too.
  if (!user) {
    redirect("/admin/login");
  }

  const defaultMonth = messMonthForDate(todayInOfficeTz());

  if (!isAdmin) {
    // Signup couldn't register them inline (email confirmation was required,
    // or the month they picked was taken), so finish it here.
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Finish mess manager setup
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          You&rsquo;re signed in as {user.email}. Pick the month you manage to open your
          dashboard.
        </p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <RegisterManagerForm defaultName="" defaultMonth={defaultMonth} />
        </div>

        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="h-10 rounded-full border border-slate-300 px-4 text-sm font-medium text-slate-700"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  let periods: Awaited<ReturnType<typeof listMyPeriods>> = [];
  let loadError: string | null = null;
  try {
    periods = await listMyPeriods();
  } catch {
    loadError = "Could not load your mess months. Please refresh the page.";
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5 sm:flex-row sm:gap-6 sm:py-8">
      <aside className="sm:w-48 sm:flex-shrink-0">
        <div className="mb-3 hidden sm:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Mess manager
          </p>
          <p className="truncate text-sm text-slate-600">{profile?.full_name || user.email}</p>
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1">
        {loadError ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        ) : periods.length === 0 ? (
          // Every page is scoped to a mess month, so there's nothing to show
          // until they have one.
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Pick your mess month
              </h1>
              <p className="text-sm text-slate-500">
                Your dashboard, prices, and reports cover the month you manage.
              </p>
            </div>
            <NewPeriodForm defaultMonth={defaultMonth} submitLabel="Start managing" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
