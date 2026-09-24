"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { isValidDateStr } from "@/lib/utils/date";
import type { ActionResult } from "@/lib/actions/employees";

/**
 * Adds a price row to one of the manager's own periods. RLS rejects the
 * insert if the period isn't theirs or effectiveFrom falls outside it.
 */
export async function updatePrices(input: {
  periodId: string;
  breakfastPrice: number;
  lunchPrice: number;
  dinnerPrice: number;
  effectiveFrom: string;
}): Promise<ActionResult> {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");

  const { periodId, breakfastPrice, lunchPrice, dinnerPrice, effectiveFrom } = input;

  if (!periodId) return { ok: false, error: "Pick a mess month first." };
  if (!isValidDateStr(effectiveFrom)) return { ok: false, error: "Pick a valid date." };
  if ([breakfastPrice, lunchPrice, dinnerPrice].some((p) => !Number.isFinite(p) || p < 0)) {
    return { ok: false, error: "Prices must be zero or a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meal_prices").insert({
    period_id: periodId,
    breakfast_price: breakfastPrice,
    lunch_price: lunchPrice,
    dinner_price: dinnerPrice,
    effective_from: effectiveFrom,
  });

  if (error) {
    console.error("updatePrices failed", error);
    return { ok: false, error: "Could not save prices. The date must be inside this mess month." };
  }

  revalidatePath("/admin/prices");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true };
}
