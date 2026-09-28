"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { getMyPeriod } from "@/lib/data/periods";
import type { ActionResult } from "@/lib/actions/employees";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { cleanMenuItem, isDateInPeriod, type DayMenu, type MealWeights } from "@/lib/utils/mess";
import type { MealCutoffs } from "@/lib/utils/cutoffs";

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

/**
 * Re-renders the current admin page in the same response as the action, so
 * callers must NOT also call router.refresh() (that fetches it twice).
 */
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

  // No revalidate: the Meal Status table re-prices itself locally, and every
  // other page is dynamic, so it reads fresh weights on its next visit.
  return { ok: true };
}

/**
 * Announces what's being served on one date ("Khichuri", "Beef"), which
 * employees see under that meal. A blank box means nothing announced for
 * that meal; blanking all three removes the date's menu row.
 */
export async function setDayMenu(dateStr: string, input: DayMenu): Promise<ActionResult> {
  const period = await requirePeriod();

  if (!isValidDateStr(dateStr) || !isDateInPeriod(dateStr, period)) {
    return { ok: false, error: "That date is outside your mess month." };
  }

  const menu: DayMenu = {
    breakfast: cleanMenuItem(input.breakfast),
    lunch: cleanMenuItem(input.lunch),
    dinner: cleanMenuItem(input.dinner),
  };

  const supabase = await createClient();
  const { error } =
    !menu.breakfast && !menu.lunch && !menu.dinner
      ? await supabase.from("meal_menus").delete().eq("meal_date", dateStr)
      : await supabase.from("meal_menus").upsert(
          {
            meal_date: dateStr,
            breakfast_item: menu.breakfast,
            lunch_item: menu.lunch,
            dinner_item: menu.dinner,
          },
          { onConflict: "meal_date" }
        );

  if (error) {
    console.error("setDayMenu failed", error);
    return { ok: false, error: "Could not save the menu." };
  }

  // Both panels are dynamic, so they read the new menu on their next load.
  return { ok: true };
}

/**
 * "Test meal rate": sets (or clears, with null) the rate the manager's own
 * pages bill with. Employees never see it — see publishMealRate.
 */
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

/**
 * "Publish meal rate": every employee's panel now shows this rate with
 * their bill, deposit, and due/refund. The manager's pages switch to it
 * too. null unpublishes (employees see no rate again). The database stamps
 * rate_published_at (0013_published_meal_rate.sql).
 */
export async function publishMealRate(rate: number | null): Promise<ActionResult> {
  const period = await requirePeriod();

  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    return { ok: false, error: "Meal rate must be zero or a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("mess_periods")
    .update(rate === null ? { published_meal_rate: null } : { meal_rate: rate, published_meal_rate: rate })
    .eq("id", period.id);

  if (error) {
    console.error("publishMealRate failed", error);
    return {
      ok: false,
      error: /published_meal_rate/.test(error.message ?? "")
        ? "Publishing isn’t set up yet — run migration 0013."
        : "Could not publish the meal rate.",
    };
  }

  // The Employee Panel is dynamic, so employees see it on their next load.
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

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Sets the employee meal deadlines. Office-wide (not per month), like the
 * employee list, so any mess manager can change them; RLS allows only
 * managers to update the row.
 */
export async function setMealCutoffs(input: MealCutoffs): Promise<ActionResult> {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");

  if (![input.breakfast, input.lunch, input.dinner].every((t) => HHMM.test(t))) {
    return { ok: false, error: "Enter each time as HH:MM." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_cutoffs")
    .update({
      breakfast_cutoff: input.breakfast,
      lunch_cutoff: input.lunch,
      dinner_cutoff: input.dinner,
    })
    .eq("id", true)
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("setMealCutoffs failed", error);
    return {
      ok: false,
      error: error ? "Could not save the deadlines." : "Deadline settings are missing — run migration 0009.",
    };
  }

  // The Employee Panel is dynamic, so it reads the new times on its next load.
  return { ok: true };
}
