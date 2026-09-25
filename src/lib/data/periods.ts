import "server-only";
import { getAdminSession } from "@/lib/auth/session";
import type { MessPeriod } from "@/lib/types/database";

/**
 * The signed-in manager's mess month (each account manages exactly one).
 * Comes from the per-request session lookup, so it costs no extra query.
 */
export async function getMyPeriod(): Promise<MessPeriod | null> {
  const { period } = await getAdminSession();
  return period;
}
