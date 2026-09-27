import { EmployeeAuthForm } from "@/components/employee/EmployeeAuthForm";

export const dynamic = "force-dynamic";

export default async function EmployeeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/employee") ? next : "/employee";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Employee Sign In</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to set your meals and see your bill.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <EmployeeAuthForm mode="login" next={safeNext} />
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">
        Forgot your password? Ask the mess manager to reset your login, then sign up again.
      </p>
    </div>
  );
}
