import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AdminProfile } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";

export type AdminSession = {
  user: User | null;
  isAdmin: boolean;
  profile: AdminProfile | null;
};

/**
 * The authoritative mess-manager check. A Supabase session alone is NOT
 * enough — we also require the user's own row in admin_profiles, created
 * when they register as a mess manager. RLS on admin_profiles means this
 * query only ever returns the caller's own row.
 */
export async function getAdminSession(): Promise<AdminSession> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isAdmin: false, profile: null };
  }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, isAdmin: !!profile, profile: profile ?? null };
}
