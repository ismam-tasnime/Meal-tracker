import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { isMissingFromDatabase } from "@/lib/supabase/errors";
import { NO_GUESTS, type GuestCounts } from "@/lib/utils/guests";

/** The guests declared for one date. */
export type GuestDay = GuestCounts & { date: string };

/**
 * Every date of the mess month with guests, oldest first. RLS returns only
 * the caller's own month (0014_guest_meals_spending.sql).
 */
export async function listGuestDays(periodId: string): Promise<GuestDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guest_meals")
    .select("meal_date, breakfast_guests, lunch_guests, dinner_guests")
    .eq("period_id", periodId)
    .order("meal_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    date: row.meal_date,
    breakfast: Number(row.breakfast_guests),
    lunch: Number(row.lunch_guests),
    dinner: Number(row.dinner_guests),
  }));
}

/**
 * Today's guests, for the cook's meal board. The board is public and
 * guest_meals isn't, so this asks get_today_guest_meals(), which answers
 * for today (Asia/Dhaka) only. `date` is the board's today: in the rare case
 * the page and the database straddle midnight, the other day's guests
 * aren't shown under this one.
 *
 * Null when the counts couldn't be loaded, so the board can say so instead
 * of showing no guests. Before migration 0014 is run there are simply no
 * guests yet, which isn't an error.
 */
export async function getTodayGuests(date: string): Promise<GuestCounts | null> {
  try {
    const { data, error } = await createPublicClient()
      .rpc("get_today_guest_meals")
      .maybeSingle();
    if (error) throw error;
    if (!data || data.meal_date !== date) return NO_GUESTS;

    return {
      breakfast: Number(data.breakfast_guests),
      lunch: Number(data.lunch_guests),
      dinner: Number(data.dinner_guests),
    };
  } catch (error) {
    if (isMissingFromDatabase(error)) return NO_GUESTS;
    console.error("Failed to load today's guests", error);
    return null;
  }
}
