import { EmployeeManager } from "@/components/admin/EmployeeManager";
import { listAllEmployees } from "@/lib/data/employees";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  let employees: Awaited<ReturnType<typeof listAllEmployees>> = [];
  let loadError: string | null = null;

  try {
    employees = await listAllEmployees();
  } catch {
    loadError = "Could not load employees. Please refresh the page.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Employees</h1>
        <p className="text-sm text-slate-500">
          Add, rename, activate/deactivate, or remove employees. Only active employees appear on
          the public meal sheet.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <EmployeeManager initialEmployees={employees} />
      )}
    </div>
  );
}
