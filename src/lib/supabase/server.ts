import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Server-side Supabase client bound to the request's cookies. Always uses
 * the public anon key — auth/authorization comes from the user's session
 * cookie plus Row Level Security, never from a service-role key. Safe to
 * call from Server Components, Server Actions, and Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render (not an Action/Route
          // Handler) where cookies can't be written. Middleware refreshes
          // the session cookie on navigation, so this is safe to ignore.
        }
      },
    },
  });
}
