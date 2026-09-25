import { EmployeeManager } from "@/components/admin/EmployeeManager";
import { listAllEmployees } from "@/lib/data/employees";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  let employees: Awaited<ReturnType<typeof listAllEmployees>> = [];
  let loadError: string | null = null;

  try {
    employees = await listAllEmployees();
  } catch {
    loadError = "Could not load employees.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Employees</h1>
        <p className="text-sm text-slate-500">
          Add, rename, activate/deactivate, or remove employees. Only active employees appear on
          the public meal sheet.
        </p>
      </div>

      {loadError ? (
        <LoadError message={loadError ?? "Could not load this page."} />
      ) : (
        <EmployeeManager initialEmployees={employees} />
      )}
    </div>
  );
}
