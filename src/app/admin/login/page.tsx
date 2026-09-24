import Link from "next/link";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function ManagerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/admin") ? next : "/admin";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Mess Manager Sign In</h1>
        <p className="mt-1 text-sm text-slate-500">Office Meal Manager — mess managers only.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <LoginForm next={safeNext} />

        <p className="mt-4 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
          New mess manager?{" "}
          <Link href="/admin/signup" className="font-medium text-indigo-600">
            Create your account
          </Link>
        </p>
      </div>
    </div>
  );
}
