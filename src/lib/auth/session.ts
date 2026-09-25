import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AdminProfile, MessPeriod } from "@/lib/types/database";

export type AdminSession = {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
  profile: AdminProfile | null;
  /** The account's mess month (each account manages exactly one). */
  period: MessPeriod | null;
};

/**
 * The authoritative mess-manager check. A Supabase session alone is NOT
 * enough — we also require the user's own row in admin_profiles, created
 * when they register as a mess manager. RLS on admin_profiles and
 * mess_periods means these queries only ever return the caller's own rows.
 *
 * getClaims() verifies the session JWT's signature locally (no round trip
 * to Supabase Auth when the project uses asymmetric signing keys), and the
 * profile and period are fetched in parallel. Cached per request, so the
 * layout, page, and any server action share one lookup.
 */
export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return { user: null, isAdmin: false, profile: null, period: null };
  }

  const [{ data: profile }, { data: period, error: periodError }] = await Promise.all([
    supabase.from("admin_profiles").select("*").eq("id", claims.sub).maybeSingle(),
    supabase.from("mess_periods").select("*").eq("manager_id", claims.sub).maybeSingle(),
  ]);

  if (periodError) throw periodError;

  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null },
    isAdmin: !!profile,
    profile: profile ?? null,
    period: period ?? null,
  };
});
