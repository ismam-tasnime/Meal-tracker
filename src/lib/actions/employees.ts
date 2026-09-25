"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { hasMealRecords } from "@/lib/data/employees";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");
}

function validToken(tokenNo: number | null): boolean {
  return tokenNo === null || (Number.isInteger(tokenNo) && tokenNo >= 0);
}

function saveError(error: { code?: string }, tokenNo: number | null, fallback: string): ActionResult {
  // 23505: the employees_token_no_key unique index.
  if (error.code === "23505" && tokenNo !== null) {
    return { ok: false, error: `Token ${tokenNo} is already used by another employee.` };
  }
  return { ok: false, error: fallback };
}

export async function createEmployee(name: string, tokenNo: number | null): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (!validToken(tokenNo)) return { ok: false, error: "Token must be a whole number." };

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({ name: trimmed, token_no: tokenNo });

  if (error) return saveError(error, tokenNo, "Could not add employee.");

  revalidatePath("/admin/employees");
  revalidatePath("/");
  return { ok: true };
}

export async function updateEmployee(
  id: string,
  name: string,
  tokenNo: number | null
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (!validToken(tokenNo)) return { ok: false, error: "Token must be a whole number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ name: trimmed, token_no: tokenNo })
    .eq("id", id);

  if (error) return saveError(error, tokenNo, "Could not update employee.");

  revalidatePath("/admin/employees");
  revalidatePath("/");
  return { ok: true };
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ is_active: isActive }).eq("id", id);

  if (error) return { ok: false, error: "Could not update employee." };

  revalidatePath("/admin/employees");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Hard delete is only allowed when the employee has no meal history, so
 * that past billing records can never silently disappear. Otherwise admins
 * should deactivate instead.
 */
export async function deleteEmployee(id: string): Promise<ActionResult> {
  await requireAdmin();

  if (await hasMealRecords(id)) {
    return {
      ok: false,
      error: "This employee has meal history and can't be deleted. Deactivate them instead.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", id);

  if (error) {
    // 23503: still referenced — they have deposits in some mess month.
    if (error.code === "23503") {
      return {
        ok: false,
        error: "This employee has deposit records and can't be deleted. Deactivate them instead.",
      };
    }
    return { ok: false, error: "Could not remove employee." };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/");
  return { ok: true };
}
