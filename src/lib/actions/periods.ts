"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/employees";
import { messMonthRange, periodErrorMessage, validMessMonth } from "@/lib/utils/mess";

/** Adds another mess month for the signed-in manager. */
export async function createPeriod(year: number, month: number): Promise<ActionResult> {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");

  if (!validMessMonth(year, month)) {
    return { ok: false, error: "Pick a valid month." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("mess_periods").insert(messMonthRange(year, month));

  if (error) {
    console.error("createPeriod failed", error);
    return { ok: false, error: periodErrorMessage(error, "Could not add that month.") };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Removes one of the manager's own periods (and its prices). Meal records
 * themselves are untouched — they belong to the office, not the manager.
 */
export async function deletePeriod(id: string): Promise<ActionResult> {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("mess_periods").delete().eq("id", id).select("id");

  if (error || !data?.length) return { ok: false, error: "Could not remove that month." };

  revalidatePath("/admin", "layout");
  return { ok: true };
}
