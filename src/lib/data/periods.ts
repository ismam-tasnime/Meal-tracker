import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MessPeriod } from "@/lib/types/database";

/**
 * The signed-in manager's own mess periods, newest first. RLS hides everyone
 * else's. Cached per request, since the layout and the page both need it.
 */
export const listMyPeriods = cache(async (): Promise<MessPeriod[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mess_periods")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
});
