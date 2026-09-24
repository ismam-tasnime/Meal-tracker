import { BillSummaryTable } from "@/components/admin/BillSummaryTable";
import { DepositForm } from "@/components/admin/DepositForm";
import { DepositList } from "@/components/admin/DepositList";
import { MealRateForm } from "@/components/admin/MealRateForm";
import { listAllEmployees } from "@/lib/data/employees";
import { listDeposits } from "@/lib/data/mess";
import { getMyPeriod } from "@/lib/data/periods";
import { getPeriodReport } from "@/lib/data/reports";

export const dynamic = "force-dynamic";

export default async function ManagerExpenseStatusPage() {
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  let rows: Awaited<ReturnType<typeof getPeriodReport>> = [];
  let deposits: Awaited<ReturnType<typeof listDeposits>> = [];
  let employees: Awaited<ReturnType<typeof listAllEmployees>> = [];
  let loadError: string | null = null;

  try {
    [rows, deposits, employees] = await Promise.all([
      getPeriodReport(period.id),
      listDeposits(period.id),
      listAllEmployees(),
    ]);
  } catch {
    loadError = "Could not load expense status. Please refresh the page.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Expense Status</h1>
        <p className="text-sm text-slate-500">
          Record money employees hand in — before, during, or at the end of the month — and see
          who still owes and who has money left.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <>
          <DepositForm employees={employees.filter((e) => e.is_active)} />
          <MealRateForm current={period.meal_rate} />

          {period.meal_rate === null && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Bills appear once you set the meal rate above. Meal counts and deposits are already
              up to date.
            </p>
          )}

          <BillSummaryTable rows={rows} period={period} />

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Deposit history ({deposits.length})
            </h2>
            <DepositList deposits={deposits} />
          </div>
        </>
      )}
    </div>
  );
}
