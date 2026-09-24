"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { countMealRecordsForEmployee } from "@/lib/data/employees";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");
}

export async function createEmployee(name: string): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({ name: trimmed });

  if (error) return { ok: false, error: "Could not add employee." };

  revalidatePath("/admin/employees");
  revalidatePath("/");
  return { ok: true };
}

export async function updateEmployeeName(id: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ name: trimmed }).eq("id", id);

  if (error) return { ok: false, error: "Could not update employee." };

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

  const mealCount = await countMealRecordsForEmployee(id);
  if (mealCount > 0) {
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
