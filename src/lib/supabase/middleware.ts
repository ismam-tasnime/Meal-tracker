import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase auth session on every request and gates access to
 * /admin/*. This only checks that a session exists — the actual admin-role
 * check (is the signed-in user in admin_profiles?) happens again, server
 * side, in src/app/admin/layout.tsx via RLS. Middleware alone must never be
 * trusted as the sole authorization boundary.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  // Reachable without a session: sign-in, and the one-time first-admin signup.
  const isPublicAdminRoute = pathname === "/admin/login" || pathname === "/admin/signup";

  if (isAdminRoute && !isPublicAdminRoute && !user) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/admin/login" && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}
