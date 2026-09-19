"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import type { ActionResult } from "@/lib/actions/employees";

export async function updatePrices(input: {
  breakfastPrice: number;
  lunchPrice: number;
  dinnerPrice: number;
  effectiveFrom?: string;
}): Promise<ActionResult> {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");

  const { breakfastPrice, lunchPrice, dinnerPrice } = input;
  const effectiveFrom =
    input.effectiveFrom && isValidDateStr(input.effectiveFrom)
      ? input.effectiveFrom
      : todayInOfficeTz();

  if ([breakfastPrice, lunchPrice, dinnerPrice].some((p) => !Number.isFinite(p) || p < 0)) {
    return { ok: false, error: "Prices must be zero or a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meal_prices").insert({
    breakfast_price: breakfastPrice,
    lunch_price: lunchPrice,
    dinner_price: dinnerPrice,
    effective_from: effectiveFrom,
  });

  if (error) return { ok: false, error: "Could not save prices." };

  revalidatePath("/admin/prices");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true };
}
