import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "./session";

// The admin security boundary. Every admin page, data loader and server action calls
// requireAdmin() itself; nothing relies on the proxy or on hidden navigation.
// Admin = a signed-in Supabase user with a row in public.admins (the same check RLS uses).


// Once per request (React cache): verifies the session with Supabase Auth (getUser contacts the
// auth server, unlike reading the cookie) and the admins row through RLS in parallel.
const loadAdmin = cache(async () => {
  await connection(); // per request, never prerendered (and before any env access)
  return verifyAdminSession(await createClient());
});

export async function requireAdmin() {
  const session = await loadAdmin();
  if (!session.user) redirect("/admin/login");
  if (!session.isAdmin) redirect("/admin/login?error=not_admin");
  // `now` is this request's clock for hold/deadline rules, read once so a page is self-consistent.
  return { supabase: session.supabase, user: session.user, now: Date.now() };
}
