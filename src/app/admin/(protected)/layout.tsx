import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { getMyPeriod } from "@/lib/data/periods";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOut } from "@/lib/actions/auth";
import { formatPeriodRange } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, profile } = await getAdminSession();

  // Defense in depth: the proxy (middleware) already redirects unauthenticated
  // visitors, but every server render re-checks here too.
  if (!user) {
    redirect("/admin/login");
  }

  let period: Awaited<ReturnType<typeof getMyPeriod>> = null;
  if (isAdmin) {
    period = await getMyPeriod().catch(() => null);
  }

  if (!isAdmin || !period) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 text-center">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {isAdmin ? "Can’t load your mess month" : "Not a mess manager"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isAdmin
            ? "Please refresh the page in a moment."
            : "This account isn’t set up as a mess manager. Sign out and sign in with your mess month, like “January 2026”."}
        </p>
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5 sm:flex-row sm:gap-6 sm:py-8">
      <aside className="sm:w-48 sm:flex-shrink-0">
        <div className="mb-3 hidden sm:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Mess manager
          </p>
          <p className="truncate text-sm font-medium text-slate-700">{profile?.full_name}</p>
          <p className="text-xs text-slate-500">{formatPeriodRange(period)}</p>
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
