import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Admin area only: keeps the Supabase session cookie fresh and sends signed-out visitors to the
// login page. This is a convenience, NOT the security boundary: every admin page and action checks
// the session and the admins table again on the server (lib/admin/auth).
export async function proxy(request: NextRequest) {
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
    const isLogin = request.nextUrl.pathname === "/admin/login";
    if (!data?.claims && !isLogin) {
      const login = new URL("/admin/login", request.url);
      const redirect = NextResponse.redirect(login);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      response = redirect;
    }
  }

  // Admin pages hold customer data: never cache them anywhere.
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
