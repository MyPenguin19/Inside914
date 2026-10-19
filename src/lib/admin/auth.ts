import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The admin security boundary. Every admin page, data loader and server action calls
// requireAdmin() itself; nothing relies on the proxy or on hidden navigation.
// Admin = a signed-in Supabase user with a row in public.admins (the same check RLS uses).


// Once per request (React cache): verifies the session with Supabase Auth (getUser contacts the
// auth server, unlike reading the cookie), then the admins row through RLS.
const loadAdmin = cache(async () => {
  await connection(); // per request, never prerendered (and before any env access)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false } as const;
  const { data } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return { supabase, user, isAdmin: Boolean(data) } as const;
});

export async function requireAdmin() {
  const session = await loadAdmin();
  if (!session.user) redirect("/admin/login");
  if (!session.isAdmin) redirect("/admin/login?error=not_admin");
  // `now` is this request's clock for hold/deadline rules, read once so a page is self-consistent.
  return { supabase: session.supabase, user: session.user, now: Date.now() };
}
