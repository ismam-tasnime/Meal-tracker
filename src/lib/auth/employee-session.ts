import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types/database";

export type SignedInEmployee = Pick<Employee, "id" | "name" | "token_no" | "is_active"> & {
  phone: string;
};

export type EmployeeSession = {
  user: { id: string } | null;
  /** Null when the signed-in login isn't linked to an employee (e.g. a mess manager). */
  employee: SignedInEmployee | null;
};

/**
 * Who is signed in to the Employee Panel. A Supabase session alone is not
 * enough: the login must be linked to an employee in employee_accounts,
 * which only register_employee() can do. RLS lets a login read only its own
 * employee_accounts row, so the query returns at most that one row.
 *
 * Same shape as getAdminSession(): claims check and row lookup run in
 * parallel, cached per request.
 */
export const getEmployeeSession = cache(async (): Promise<EmployeeSession> => {
  const supabase = await createClient();

  const [{ data }, { data: account, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("employee_accounts")
      .select("phone, user_id, employees(id, name, token_no, is_active)")
      .maybeSingle(),
  ]);
  const claims = data?.claims;

  // Signed-out visitors query as anon, which may not read the table at all.
  if (!claims?.sub) return { user: null, employee: null };

  if (error) throw error;

  // Belt and braces on top of RLS: the row must be the verified user's own.
  const own = account && account.user_id === claims.sub ? account : null;
  const embedded = own?.employees;
  const employee = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;

  return {
    user: { id: claims.sub },
    employee: own && employee ? { ...employee, phone: own.phone } : null,
  };
});
