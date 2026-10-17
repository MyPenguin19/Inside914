import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

// Cookieless publishable-key client for public catalog reads (no user session; RLS applies).
export function createPublicClient() {
  const env = getPublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
