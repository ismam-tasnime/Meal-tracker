import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MealPrice } from "@/lib/types/database";

/** Price changes within one mess period, newest first. */
export async function getPriceHistory(periodId: string): Promise<MealPrice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_prices")
    .select("*")
    .eq("period_id", periodId)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
