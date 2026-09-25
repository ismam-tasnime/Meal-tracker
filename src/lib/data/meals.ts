import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { MealType } from "@/lib/types/database";

export type MealSheetRow = {
  employeeId: string;
  employeeName: string;
  tokenNo: number | null;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
};

type DayRecord = { breakfast: boolean; lunch: boolean; dinner: boolean };

/** At most one record per employee per date (unique constraint). */
function mealsOf(records: DayRecord[] | null | undefined): DayRecord {
  const record = records?.[0];
  return {
    breakfast: record?.breakfast ?? false,
    lunch: record?.lunch ?? false,
    dinner: record?.dinner ?? false,
  };
}

/**
 * The public meal sheet for a single date: every active employee, merged
 * with their meal_records row for that date (defaulting all meals to OFF
 * when no row exists yet). Read-only, no prices — safe for the public panel.
 *
 * One query: the date's meal_records are embedded per employee (filtering
 * the embedded rows, not the employees), so only active employees' records
 * are read and there's no second round trip to merge.
 */
export async function getMealSheet(dateStr: string): Promise<MealSheetRow[]> {
  // Public data (RLS allows anon reads), so no session cookie is needed.
  const supabase = createPublicClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, token_no, meal_records(breakfast, lunch, dinner)")
    .eq("is_active", true)
    .eq("meal_records.meal_date", dateStr)
    .order("token_no", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return (employees ?? []).map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    tokenNo: employee.token_no,
    ...mealsOf(employee.meal_records),
  }));
}

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export type AdminMealSheetRow = MealSheetRow & { isActive: boolean };

/** Same as getMealSheet but includes inactive employees, for admin editing/history. */
export async function getAdminMealSheet(dateStr: string): Promise<AdminMealSheetRow[]> {
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, token_no, is_active, meal_records(breakfast, lunch, dinner)")
    .eq("meal_records.meal_date", dateStr)
    .order("token_no", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return (employees ?? []).map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    tokenNo: employee.token_no,
    isActive: employee.is_active,
    ...mealsOf(employee.meal_records),
  }));
}
