import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MealPrice } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";

export async function getCurrentPrices(): Promise<MealPrice | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_prices")
    .select("*")
    .lte("effective_from", todayInOfficeTz())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPriceHistory(): Promise<MealPrice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_prices")
    .select("*")
    .order("effective_from", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
