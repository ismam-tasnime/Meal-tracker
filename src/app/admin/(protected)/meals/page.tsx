import { DateNav } from "@/components/public/DateNav";
import { AdminMealEditor } from "@/components/admin/AdminMealEditor";
import { getAdminMealSheet } from "@/lib/data/meals";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function AdminMealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;
  const date = isValidDateStr(rawDate) ? rawDate : todayInOfficeTz();

  let rows: Awaited<ReturnType<typeof getAdminMealSheet>> = [];
  let loadError: string | null = null;
  try {
    rows = await getAdminMealSheet(date);
  } catch {
    loadError = "Could not load meal records. Please refresh the page.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Meals</h1>
        <p className="text-sm text-slate-500">
          Edit any employee&rsquo;s meal status for any date, including inactive employees.
        </p>
      </div>

      <DateNav date={date} basePath="/admin/meals" />

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <AdminMealEditor key={date} date={date} initialRows={rows} />
      )}
    </div>
  );
}
