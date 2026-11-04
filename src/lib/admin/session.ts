import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export async function verifyAdminSession(supabase: SupabaseClient<Database>) {
  // Use the cookie only as a credential. Its user/claims never authorize access.
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) return { supabase, user: null, isAdmin: false } as const;

  // Passing the JWT lets remote user verification and the RLS membership check run
  // together, without getUser() holding the SDK session lock needed by the query.
  // "users read own admin row" restricts this query to auth.uid(), even without a filter.
  const [verified, membership] = await Promise.all([
    supabase.auth.getUser(session.access_token),
    supabase.from("admins").select("user_id").maybeSingle(),
  ]);
  const user = verified.error ? null : verified.data.user;
  const isAdmin = !!user && !membership.error && membership.data?.user_id === user.id;
  return { supabase, user, isAdmin };
}
