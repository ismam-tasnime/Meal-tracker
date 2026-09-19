import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MealType } from "@/lib/types/database";

export type MealSheetRow = {
  employeeId: string;
  employeeName: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
};

/**
 * The public meal sheet for a single date: every active employee, merged
 * with their meal_records row for that date (defaulting all meals to OFF
 * when no row exists yet). Read-only, no prices — safe for the public panel.
 */
export async function getMealSheet(dateStr: string): Promise<MealSheetRow[]> {
  const supabase = await createClient();

  const [{ data: employees, error: employeesError }, { data: records, error: recordsError }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("meal_records")
        .select("employee_id, breakfast, lunch, dinner")
        .eq("meal_date", dateStr),
    ]);

  if (employeesError) throw employeesError;
  if (recordsError) throw recordsError;

  const recordByEmployee = new Map(
    (records ?? []).map((r) => [r.employee_id, r])
  );

  return (employees ?? []).map((employee) => {
    const record = recordByEmployee.get(employee.id);
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      breakfast: record?.breakfast ?? false,
      lunch: record?.lunch ?? false,
      dinner: record?.dinner ?? false,
    };
  });
}

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export type AdminMealSheetRow = MealSheetRow & { isActive: boolean };

/** Same as getMealSheet but includes inactive employees, for admin editing/history. */
export async function getAdminMealSheet(dateStr: string): Promise<AdminMealSheetRow[]> {
  const supabase = await createClient();

  const [{ data: employees, error: employeesError }, { data: records, error: recordsError }] =
    await Promise.all([
      supabase.from("employees").select("id, name, is_active").order("name", { ascending: true }),
      supabase
        .from("meal_records")
        .select("employee_id, breakfast, lunch, dinner")
        .eq("meal_date", dateStr),
    ]);

  if (employeesError) throw employeesError;
  if (recordsError) throw recordsError;

  const recordByEmployee = new Map((records ?? []).map((r) => [r.employee_id, r]));

  return (employees ?? []).map((employee) => {
    const record = recordByEmployee.get(employee.id);
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      isActive: employee.is_active,
      breakfast: record?.breakfast ?? false,
      lunch: record?.lunch ?? false,
      dinner: record?.dinner ?? false,
    };
  });
}
