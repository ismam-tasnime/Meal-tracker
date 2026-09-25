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
 * to Supabase Auth when the project uses asymmetric signing keys). The
 * profile and its period come back in ONE query (mess_periods embedded via
 * its manager_id foreign key), run in parallel with the claims check: RLS
 * already scopes both tables to auth.uid(), so the query doesn't need to
 * wait for the user id. Cached per request, so the layout, page, and any
 * server action share one lookup.
 */
export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const supabase = await createClient();

  const [{ data }, { data: profileRow, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("admin_profiles").select("*, mess_periods(*)").maybeSingle(),
  ]);
  const claims = data?.claims;

  // Checked first: signed-out visitors query as anon, which may not read
  // these tables at all — that's "no session", not a load failure.
  if (!claims?.sub) {
    return { user: null, isAdmin: false, profile: null, period: null };
  }

  if (error) throw error;

  // Belt and braces on top of RLS: the row must be the verified user's own.
  const own = profileRow && profileRow.id === claims.sub ? profileRow : null;
  const { mess_periods: embedded = null, ...profile } = own ?? {};
  // One-to-one (manager_id is unique), so PostgREST returns an object; accept
  // an array too in case the relationship is ever detected as one-to-many.
  const period = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;

  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null },
    isAdmin: !!own,
    profile: own ? (profile as AdminProfile) : null,
    period,
  };
});
