import Link from "next/link";
import { AdminSignupForm } from "@/components/admin/AdminSignupForm";
import { isAdminSetupCompleted } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminSignupPage() {
  const setupCompleted = await isAdminSetupCompleted();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {setupCompleted ? "Registration closed" : "Create admin account"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {setupCompleted
            ? "This office already has an admin."
            : "One-time setup for the first admin of this office."}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {setupCompleted ? (
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
        ) : (
          <AdminSignupForm />
        )}
      </div>
    </div>
  );
}
