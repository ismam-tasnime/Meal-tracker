import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

/**
 * Cookie-less anon client for data RLS already makes public (the employee
 * meal sheet). Unlike the cookie-bound client it never reads or refreshes a
 * signed-in manager's session, so a visit to the public page can't stall on
 * a token refresh the Server Component isn't even allowed to save. Holds no
 * per-user state, so one instance is shared across requests.
 */
export function createPublicClient() {
  client ??= createSupabaseClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
