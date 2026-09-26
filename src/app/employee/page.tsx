import { DateNav } from "@/components/public/DateNav";
import { MealSheetTable } from "@/components/public/MealSheetTable";
import { getMealCutoffs, getMealSheet } from "@/lib/data/meals";
import { DEFAULT_MEAL_CUTOFFS } from "@/lib/utils/cutoffs";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function EmployeePanelPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;
  const date = isValidDateStr(rawDate) ? rawDate : todayInOfficeTz();

  let rows: Awaited<ReturnType<typeof getMealSheet>> = [];
  let cutoffs = DEFAULT_MEAL_CUTOFFS;
  let loadError: string | null = null;
  try {
    // getMealCutoffs never throws (falls back to defaults), so it can't fail the page.
    [rows, cutoffs] = await Promise.all([getMealSheet(date), getMealCutoffs()]);
  } catch (err) {
    console.error("Failed to load meal sheet", err);
    loadError = "Could not load the meal sheet.";
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5 sm:py-8">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Employee Panel</h1>
          <p className="text-xs text-slate-500">
            Tap a meal to switch it ON or OFF. Saves instantly — no login needed.
          </p>
        </div>
      </header>

      <div className="mb-5">
        <DateNav date={date} basePath="/employee" />
      </div>

      {loadError ? (
        <LoadError message={loadError} />
      ) : (
        <MealSheetTable
          key={date}
          date={date}
          initialRows={rows}
          cutoffs={cutoffs}
          // Server Component, rendered once per request (force-dynamic): this
          // is the request's time, which the sheet's lock clock follows.
          // eslint-disable-next-line react-hooks/purity
          serverNow={Date.now()}
        />
      )}
    </div>
  );
}
