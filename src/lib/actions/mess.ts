"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { getMyPeriod } from "@/lib/data/periods";
import type { ActionResult } from "@/lib/actions/employees";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { isDateInPeriod, type MealWeights } from "@/lib/utils/mess";

// Every mutation here is scoped to the caller's own period, looked up from
// their session — never taken from the request — and RLS rejects anything
// outside it regardless.
async function requirePeriod() {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");
  const period = await getMyPeriod();
  if (!period) throw new Error("No mess month found for this account.");
  return period;
}

function revalidateMoneyPages() {
  revalidatePath("/admin", "layout");
}

const MAX_WEIGHT = 10;

/** Sets the Breakfast/Lunch/Dinner meal counts for one date; applies to everyone who ate. */
export async function setDayWeights(dateStr: string, input: MealWeights): Promise<ActionResult> {
  const period = await requirePeriod();

  // Columns are numeric(5,2); round explicitly so what's shown is what's billed.
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const weights: MealWeights = {
    breakfast: round2(input.breakfast),
    lunch: round2(input.lunch),
    dinner: round2(input.dinner),
  };

  if (!isValidDateStr(dateStr) || !isDateInPeriod(dateStr, period)) {
    return { ok: false, error: "That date is outside your mess month." };
  }
  const values = [weights.breakfast, weights.lunch, weights.dinner];
  if (values.some((w) => !Number.isFinite(w) || w < 0 || w > MAX_WEIGHT)) {
    return { ok: false, error: `Meal counts must be between 0 and ${MAX_WEIGHT}.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meal_day_weights").upsert(
    {
      period_id: period.id,
      meal_date: dateStr,
      breakfast_weight: weights.breakfast,
      lunch_weight: weights.lunch,
      dinner_weight: weights.dinner,
    },
    { onConflict: "period_id,meal_date" }
  );

  if (error) {
    console.error("setDayWeights failed", error);
    return { ok: false, error: "Could not save meal counts." };
  }

  revalidateMoneyPages();
  return { ok: true };
}

/** Sets (or clears, with null) the month-end meal rate. */
export async function setMealRate(rate: number | null): Promise<ActionResult> {
  const period = await requirePeriod();

  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    return { ok: false, error: "Meal rate must be zero or a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("mess_periods")
    .update({ meal_rate: rate })
    .eq("id", period.id);

  if (error) {
    console.error("setMealRate failed", error);
    return { ok: false, error: "Could not save the meal rate." };
  }

  revalidateMoneyPages();
  return { ok: true };
}

export async function addDeposit(input: {
  employeeId: string;
  amount: number;
  depositedOn?: string;
  note?: string;
}): Promise<ActionResult> {
  const period = await requirePeriod();

  const amount = Math.round(input.amount * 100) / 100;
  if (!input.employeeId) return { ok: false, error: "Pick an employee." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Deposit must be more than zero." };
  }
  const depositedOn =
    input.depositedOn && isValidDateStr(input.depositedOn) ? input.depositedOn : todayInOfficeTz();
  const note = input.note?.trim().slice(0, 200) || null;

  const supabase = await createClient();
  const { error } = await supabase.from("deposits").insert({
    period_id: period.id,
    employee_id: input.employeeId,
    amount,
    deposited_on: depositedOn,
    note,
  });

  if (error) {
    console.error("addDeposit failed", error);
    return { ok: false, error: "Could not save the deposit." };
  }

  revalidateMoneyPages();
  return { ok: true };
}

export async function deleteDeposit(id: string): Promise<ActionResult> {
  await requirePeriod();

  const supabase = await createClient();
  const { data, error } = await supabase.from("deposits").delete().eq("id", id).select("id");

  if (error || !data?.length) return { ok: false, error: "Could not remove the deposit." };

  revalidateMoneyPages();
  return { ok: true };
}
