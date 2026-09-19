import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOut } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, profile } = await getAdminSession();

  // Defense in depth: the proxy (middleware) already redirects unauthenticated
  // visitors, but every server render re-checks here too.
  if (!user) {
    redirect("/admin/login");
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account ({user.email}) is signed in but is not registered as an admin. Ask a
          superadmin to add a row for you in the <code className="rounded bg-slate-100 px-1">admin_profiles</code>{" "}
          table.
        </p>
        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700"
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
            Admin panel
          </p>
          <p className="truncate text-sm text-slate-600">{profile?.full_name || user.email}</p>
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
