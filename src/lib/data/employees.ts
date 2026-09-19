import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types/database";

export async function listAllEmployees(): Promise<Employee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function countActiveEmployees(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) throw error;
  return count ?? 0;
}

export async function countMealRecordsForEmployee(employeeId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("meal_records")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId);

  if (error) throw error;
  return count ?? 0;
}
