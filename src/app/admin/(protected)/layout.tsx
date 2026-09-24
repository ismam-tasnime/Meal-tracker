import { redirect } from "next/navigation";
import { getAdminSession, getAdminSetupState } from "@/lib/auth/session";
import { AdminNav } from "@/components/admin/AdminNav";
import { ClaimAdminButton } from "@/components/admin/ClaimAdminButton";
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
    // Signup couldn't claim admin inline (email confirmation was required),
    // so offer the claim here as long as the slot is still open.
    const setupState = await getAdminSetupState();
    const canClaim = setupState === "open";

    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 text-center">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {canClaim ? "Finish admin setup" : "Not authorized"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {canClaim ? (
            <>
              You&rsquo;re signed in as {user.email}. No admin exists for this office yet —
              claim it to finish setup.
            </>
          ) : (
            <>
              Your account ({user.email}) is signed in but is not an admin. Ask an existing
              admin to grant you access.
            </>
          )}
        </p>

        {canClaim && (
          <div className="mt-4">
            <ClaimAdminButton defaultName={user.email ?? ""} />
          </div>
        )}

        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="h-10 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700"
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
