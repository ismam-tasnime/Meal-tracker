import { EmployeeAuthForm } from "@/components/employee/EmployeeAuthForm";

// No per-request data: prerendered once at build time and served from the
// CDN instead of running a server function on every visit.

export default function EmployeeSignupPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Employee sign up</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use the phone number the mess manager added for you. Each number can sign up once.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <EmployeeAuthForm mode="signup" />
      </div>
    </div>
  );
}
