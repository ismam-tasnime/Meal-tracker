import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MyEggDayRow } from "@/lib/types/database";
import type { EggEntry } from "@/lib/utils/eggs";
import { messMonthRange, type MessMonth } from "@/lib/utils/mess";

/**
 * What every employee ate in eggs on one date of the mess month, keyed by
 * employee id. Employees with no record for the date are simply absent
 * (no record = no eggs). RLS gives a manager only their own month's rows
 * (0019_egg_tracking.sql).
 */
export async function getEggSheet(
  periodId: string,
  dateStr: string
): Promise<Record<string, EggEntry>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("egg_records")
    .select("employee_id, egg_qty, egg_price, egg_total")
    .eq("period_id", periodId)
    .eq("meal_date", dateStr);

  if (error) throw error;

  const sheet: Record<string, EggEntry> = {};
  for (const row of data ?? []) {
    // Postgres numerics can arrive as strings; normalise.
    sheet[row.employee_id] = {
      qty: Number(row.egg_qty),
      price: Number(row.egg_price),
      total: Number(row.egg_total),
    };
  }
  return sheet;
}

export type MyEggDay = { date: string; qty: number; price: number; total: number };

/**
 * The signed-in employee's own eggs for one mess month, oldest first. The
 * database answers only for the caller's own employee (get_my_egg_days,
 * 0019) and the rows are read-only — only a mess manager can change a
 * quantity or a price.
 */
export async function getMyEggDays(month: MessMonth): Promise<MyEggDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_egg_days", {
    p_start: messMonthRange(month).start_date,
  });

  if (error) throw error;
  return (data ?? []).map((r: MyEggDayRow) => ({
    date: r.meal_date,
    qty: Number(r.egg_qty),
    price: Number(r.egg_price),
    total: Number(r.egg_total),
  }));
}
