import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_TOKEN_DAYS, resolveAccessToken } from "@/lib/access/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

// Reservation link from the confirmation email. Swaps the token in the URL for an httpOnly
// cookie and redirects to a clean URL, so the token doesn't linger in history or referrers.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let bookingId: string | null = null;
  try {
    bookingId = await resolveAccessToken(createAdminClient(), token);
  } catch {
    bookingId = null;
  }

  const response = NextResponse.redirect(new URL(bookingId ? "/reservation" : "/reservation?link=invalid", request.url), 303);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  if (bookingId) {
    response.cookies.set(ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/reservation",
      maxAge: ACCESS_TOKEN_DAYS * 86_400,
    });
  }
  return response;
}
