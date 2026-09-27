import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types/database";

/** The columns the Employees page shows and edits. */
export type EmployeeListItem = Pick<Employee, "id" | "name" | "token_no" | "is_active"> & {
  /** Null when the manager hasn't added a phone number yet. */
  phone: string | null;
  /** Whether the employee has signed up with that number. */
  hasLogin: boolean;
};

export async function listAllEmployees(): Promise<EmployeeListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, token_no, is_active, employee_accounts(phone, user_id)")
    .order("is_active", { ascending: false })
    .order("token_no", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(({ employee_accounts, ...employee }) => {
    // One-to-one (employee_id is the key); accept an array just in case.
    const account = Array.isArray(employee_accounts) ? employee_accounts[0] : employee_accounts;
    return { ...employee, phone: account?.phone ?? null, hasLogin: !!account?.user_id };
  });
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
