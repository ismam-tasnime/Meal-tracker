import { ManagerSignupForm } from "@/components/admin/ManagerSignupForm";

export const dynamic = "force-dynamic";

export default function ManagerSignupPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Mess manager sign up</h1>
        <p className="mt-1 text-sm text-slate-500">
          One account per mess month, shared by that month&rsquo;s team. Other months&rsquo;
          teams can&rsquo;t see your data.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ManagerSignupForm />
      </div>
    </div>
  );
}
