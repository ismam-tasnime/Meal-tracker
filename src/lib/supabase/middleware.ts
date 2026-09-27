import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const PANELS = [
  { base: "/admin", publicRoutes: ["/admin/login", "/admin/signup"] },
  { base: "/employee", publicRoutes: ["/employee/login", "/employee/signup"] },
];

/**
 * Refreshes the Supabase auth session on every request and gates access to
 * /admin/* and /employee/*. This only checks that a session exists — the
 * actual role check (is the signed-in user a mess manager / a linked
 * employee?) happens again, server side, in each panel's page or layout via
 * RLS. Middleware alone must never be trusted as the sole authorization
 * boundary.
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

  // getClaims() verifies the JWT locally (and refreshes an expiring session),
  // instead of a network round trip to Supabase Auth on every request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const { pathname } = request.nextUrl;

  // Each panel has its own sign-in; everything else under it needs a session.
  for (const panel of PANELS) {
    if (pathname !== panel.base && !pathname.startsWith(`${panel.base}/`)) continue;
    const isPublicRoute = panel.publicRoutes.includes(pathname);

    if (!isPublicRoute && !user) {
      const loginUrl = new URL(`${panel.base}/login`, request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (isPublicRoute && user) {
      return NextResponse.redirect(new URL(panel.base, request.url));
    }
  }

  return response;
}
