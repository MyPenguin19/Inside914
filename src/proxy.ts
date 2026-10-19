import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresh account sessions and route signed-out visitors to the appropriate login.
// Each protected page and action independently verifies its session and authorization.
export async function proxy(request: NextRequest) {
  if (/^\/(account|dashboard)(\/|$)/.test(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/areas", request.url), 303);
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims(); // validates and, if needed, refreshes the session
    const isAdmin = request.nextUrl.pathname.startsWith("/admin");
    const isLogin = isAdmin ? request.nextUrl.pathname === "/admin/login" : request.nextUrl.pathname.startsWith("/account");
    if (!data?.claims && !isLogin) {
      const login = new URL(isAdmin ? "/admin/login" : "/account/login", request.url);
      const redirect = NextResponse.redirect(login);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      response = redirect;
    }
  }

  // Account and administrator pages hold customer data: never cache them anywhere.
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/admin", "/admin/:path*", "/dashboard/:path*", "/account/:path*"] };
