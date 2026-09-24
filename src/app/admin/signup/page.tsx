import Link from "next/link";
import { AdminSignupForm } from "@/components/admin/AdminSignupForm";
import { getAdminSetupState } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const COPY = {
  open: {
    title: "Create admin account",
    subtitle: "One-time setup for the first admin of this office.",
  },
  closed: {
    title: "Registration closed",
    subtitle: "This office already has an admin.",
  },
  unreachable: {
    title: "Can’t reach the database",
    subtitle: "We couldn’t check whether setup is still open.",
  },
} as const;

export default async function AdminSignupPage() {
  const state = await getAdminSetupState();
  const { title, subtitle } = COPY[state];

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {state === "open" && <AdminSignupForm />}

        {state === "closed" && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-slate-600">
              Admin signup is only available until the first admin account is created, so
              nobody can grant themselves access later. Ask your existing admin to add you.
            </p>
            <Link
              href="/admin/login"
              className="flex h-11 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Go to sign in
            </Link>
          </div>
        )}

        {state === "unreachable" && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              The app couldn&rsquo;t connect to the database, so signup is held shut as a
              precaution. This is usually temporary — refresh in a moment.
            </p>
            <p className="text-slate-600">
              If it keeps happening, check that the Supabase project is running and that the
              app&rsquo;s environment variables are correct.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
