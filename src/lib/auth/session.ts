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
 * The authoritative admin check. A Supabase session alone is NOT enough —
 * we also require a matching row in admin_profiles, which only a superadmin
 * (via the Supabase SQL editor / service role) can create. RLS on
 * admin_profiles means this query only ever returns the caller's own row.
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

/**
 * Whether the first admin has already been created. Admin signup is a
 * one-time bootstrap: once this returns true, registration is permanently
 * closed and the database refuses further claims regardless of the UI.
 */
export async function isAdminSetupCompleted(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_setup_completed");

  // Fail closed: if we can't tell, treat setup as done so signup stays shut.
  if (error) {
    console.error("admin_setup_completed check failed", error);
    return true;
  }

  return data ?? true;
}
