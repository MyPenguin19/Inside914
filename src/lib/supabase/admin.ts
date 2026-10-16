import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

// Secret-key client: BYPASSES RLS. Server-only, and only after the caller has been
// authorized (admin check or a validated booking/magic-link token). Never pass it to the client.
export function createAdminClient() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
