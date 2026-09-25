import { DateNav } from "@/components/public/DateNav";
import { MealSheetTable } from "@/components/public/MealSheetTable";
import { getMealSheet } from "@/lib/data/meals";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function PublicMealSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;
  const date = isValidDateStr(rawDate) ? rawDate : todayInOfficeTz();

  let rows: Awaited<ReturnType<typeof getMealSheet>> = [];
  let loadError: string | null = null;
  try {
    rows = await getMealSheet(date);
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
        <DateNav date={date} />
      </div>

      {loadError ? (
        <LoadError message={loadError} />
      ) : (
        <MealSheetTable key={date} date={date} initialRows={rows} />
      )}
    </div>
  );
}
