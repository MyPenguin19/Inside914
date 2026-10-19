import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const client = await createClient();
  const { error } = code
    ? await client.auth.exchangeCodeForSession(code)
    : { error: true };
  if (!error) {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user?.email && user.email_confirmed_at && !user.is_anonymous) {
      const saved = await createAdminClient()
        .from("advertiser_email_verifications")
        .upsert({
          user_id: user.id,
          verified_email: user.email.toLowerCase(),
          verified_at: new Date().toISOString(),
        });
      if (saved.error) throw new Error("Could not verify account.");
    }
  }
  const target = error
    ? "/account/login"
    : url.searchParams.get("next") === "reset"
      ? "/account/reset-password"
      : "/dashboard";
  const response = NextResponse.redirect(new URL(target, url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
