import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MessPeriod } from "@/lib/types/database";

/**
 * The signed-in manager's mess month (each account manages exactly one).
 * RLS hides everyone else's. Cached per request, since the layout and the
 * page both need it.
 */
export const getMyPeriod = cache(async (): Promise<MessPeriod | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mess_periods").select("*").maybeSingle();

  if (error) throw error;
  return data;
});
