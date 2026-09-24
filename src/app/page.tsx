import Link from "next/link";
import { DateNav } from "@/components/public/DateNav";
import { MealSheetTable } from "@/components/public/MealSheetTable";
import { getMealSheet } from "@/lib/data/meals";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";

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
    loadError = "Could not load the meal sheet. Please refresh the page.";
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5 sm:py-8">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Office Meal Sheet</h1>
          <p className="text-xs text-slate-500">
            Tap a meal to switch it ON or OFF. Saves instantly — no login needed.
          </p>
        </div>
      </header>

      <div className="mb-5">
        <DateNav date={date} />
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : (
        <MealSheetTable key={date} date={date} initialRows={rows} />
      )}

      <footer className="mt-8 flex justify-center">
        <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600">
          Mess manager login
        </Link>
      </footer>
    </div>
  );
}
