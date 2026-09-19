import "server-only";
import { createClient } from "@/lib/supabase/server";
import { countActiveEmployees } from "@/lib/data/employees";
import { getMonthlyReport } from "@/lib/data/reports";
import { todayInOfficeTz } from "@/lib/utils/date";

export type DashboardStats = {
  totalEmployees: number;
  todayBreakfastCount: number;
  todayLunchCount: number;
  todayDinnerCount: number;
  monthTotalMeals: number;
  monthTotalAmount: number;
  monthLabel: { year: number; month: number };
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = todayInOfficeTz();
  const [year, month] = today.split("-").map(Number);

  const supabase = await createClient();

  const [totalEmployees, { data: todayRecords, error: todayError }, monthlyRows] =
    await Promise.all([
      countActiveEmployees(),
      supabase.from("meal_records").select("breakfast, lunch, dinner").eq("meal_date", today),
      getMonthlyReport(year, month),
    ]);

  if (todayError) throw todayError;

  const todayBreakfastCount = (todayRecords ?? []).filter((r) => r.breakfast).length;
  const todayLunchCount = (todayRecords ?? []).filter((r) => r.lunch).length;
  const todayDinnerCount = (todayRecords ?? []).filter((r) => r.dinner).length;

  const monthTotalMeals = monthlyRows.reduce(
    (sum, r) => sum + r.breakfast_count + r.lunch_count + r.dinner_count,
    0
  );
  const monthTotalAmount = monthlyRows.reduce((sum, r) => sum + r.total_amount, 0);

  return {
    totalEmployees,
    todayBreakfastCount,
    todayLunchCount,
    todayDinnerCount,
    monthTotalMeals,
    monthTotalAmount,
    monthLabel: { year, month },
  };
}
