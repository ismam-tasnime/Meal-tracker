import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types/database";

/** The columns the Employees page shows and edits. */
export type EmployeeListItem = Pick<Employee, "id" | "name" | "token_no" | "is_active">;

export async function listAllEmployees(): Promise<EmployeeListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, token_no, is_active")
    .order("is_active", { ascending: false })
    .order("token_no", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Existence check: stops at the first meal record instead of counting them all. */
export async function hasMealRecords(employeeId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_records")
    .select("id")
    .eq("employee_id", employeeId)
    .limit(1);

  if (error) throw error;
  return (data ?? []).length > 0;
}
