"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { getMyPeriod } from "@/lib/data/periods";
import type { ActionResult } from "@/lib/actions/employees";
import { isMissingFromDatabase } from "@/lib/supabase/errors";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import {
  cleanMenuItem,
  formatPeriodRange,
  isDateInPeriod,
  type DayMenu,
  type MealWeights,
  type PeriodRange,
} from "@/lib/utils/mess";
import type { MealCutoffs } from "@/lib/utils/cutoffs";
import { MAX_GUESTS, hasGuests, isValidGuestCount, type GuestCounts } from "@/lib/utils/guests";
import {
  MAX_SPENDING_AMOUNT,
  cleanPersonName,
  isValidSpendingAmount,
  roundAmount,
} from "@/lib/utils/spending";

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

const GUESTS_NOT_SET_UP = "Guest meals aren’t set up yet — run migration 0014.";
const SPENDING_NOT_SET_UP = "Spending isn’t set up yet — run migration 0014.";

/**
 * Declares how many guests eat each meal on one date. The office pays for
 * them at fixed rates, and every bill is worked out from these counts
 * (src/lib/utils/guests.ts). One record per date, so saving a date again
 * overwrites its counts; all three at 0 removes the date's record, like the
 * menu.
 */
export async function setGuestMeals(dateStr: string, input: GuestCounts): Promise<ActionResult> {
  const period = await requirePeriod();

  if (!isValidDateStr(dateStr) || !isDateInPeriod(dateStr, period)) {
    return { ok: false, error: "That date is outside your mess month." };
  }
  const counts: GuestCounts = {
    breakfast: Number(input?.breakfast),
    lunch: Number(input?.lunch),
    dinner: Number(input?.dinner),
  };
  if (![counts.breakfast, counts.lunch, counts.dinner].every(isValidGuestCount)) {
    return {
      ok: false,
      error: `Guests must be whole numbers from 0 to ${MAX_GUESTS.toLocaleString("en-US")}.`,
    };
  }

  const supabase = await createClient();
  const { error } = hasGuests(counts)
    ? await supabase.from("guest_meals").upsert(
        {
          meal_date: dateStr,
          period_id: period.id,
          breakfast_guests: counts.breakfast,
          lunch_guests: counts.lunch,
          dinner_guests: counts.dinner,
        },
        { onConflict: "meal_date" }
      )
    : await supabase
        .from("guest_meals")
        .delete()
        .eq("meal_date", dateStr)
        .eq("period_id", period.id);

  if (error) {
    console.error("setGuestMeals failed", error);
    return {
      ok: false,
      error: isMissingFromDatabase(error) ? GUESTS_NOT_SET_UP : "Could not save the guests.",
    };
  }

  // Re-renders the month's list and Total Bill to Collect from the database.
  // The cook's board is dynamic, so it shows the new counts on its next load.
  revalidateMoneyPages();
  return { ok: true };
}

export type SpendingInput = { spentOn: string; personName: string; amount: number };

type SpendingRow = { spent_on: string; person_name: string; amount: number };

/** One spending entry, tidied and checked against the mess month. */
function checkSpending(
  input: SpendingInput,
  period: PeriodRange
): { ok: true; row: SpendingRow } | { ok: false; error: string } {
  const spentOn = String(input?.spentOn ?? "");
  if (!isValidDateStr(spentOn) || !isDateInPeriod(spentOn, period)) {
    return { ok: false, error: `Pick a date inside your mess month (${formatPeriodRange(period)}).` };
  }
  const personName = cleanPersonName(String(input?.personName ?? ""));
  if (!personName) return { ok: false, error: "Enter who spent the money." };
  const amount = roundAmount(Number(input?.amount));
  if (!isValidSpendingAmount(amount)) {
    return {
      ok: false,
      error:
        amount > MAX_SPENDING_AMOUNT ? "That amount is too large." : "Spending must be more than zero.",
    };
  }
  return { ok: true, row: { spent_on: spentOn, person_name: personName, amount } };
}

/** Records one spending entry. Any number are allowed per date. */
export async function addSpending(input: SpendingInput): Promise<ActionResult> {
  const period = await requirePeriod();
  const checked = checkSpending(input, period);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { error } = await supabase
    .from("spending_records")
    .insert({ period_id: period.id, ...checked.row });

  if (error) {
    console.error("addSpending failed", error);
    return {
      ok: false,
      error: isMissingFromDatabase(error) ? SPENDING_NOT_SET_UP : "Could not save the spending.",
    };
  }

  revalidateMoneyPages();
  return { ok: true };
}

/** Corrects the date, name, or amount of one of this month's entries. */
export async function updateSpending(id: string, input: SpendingInput): Promise<ActionResult> {
  const period = await requirePeriod();
  const checked = checkSpending(input, period);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spending_records")
    .update(checked.row)
    .eq("id", id)
    .eq("period_id", period.id)
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("updateSpending failed", error);
    return { ok: false, error: "Could not save the spending. It may have been deleted." };
  }

  revalidateMoneyPages();
  return { ok: true };
}

export async function deleteSpending(id: string): Promise<ActionResult> {
  const period = await requirePeriod();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spending_records")
    .delete()
    .eq("id", id)
    .eq("period_id", period.id)
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("deleteSpending failed", error);
    return { ok: false, error: "Could not delete the spending." };
  }

  revalidateMoneyPages();
  return { ok: true };
}

export type SpendingTotalResult =
  | { ok: true; total: number; entries: number }
  | { ok: false; error: string };

/**
 * "Sum Spending": the database adds up every entry recorded for this mess
 * month right now (get_spending_total, 0014). Nothing is stored, so the
 * total always matches the entries, including ones another team member
 * just added.
 */
export async function sumSpending(): Promise<SpendingTotalResult> {
  const period = await requirePeriod();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_spending_total", { p_period_id: period.id })
    .single();

  if (error || !data) {
    if (error) console.error("sumSpending failed", error);
    return {
      ok: false,
      error:
        error && isMissingFromDatabase(error) ? SPENDING_NOT_SET_UP : "Could not add up the spending.",
    };
  }

  // Postgres numerics can arrive as strings; normalise.
  return { ok: true, total: Number(data.total_amount), entries: Number(data.entry_count) };
}
