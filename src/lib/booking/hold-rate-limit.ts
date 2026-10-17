import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Hold attempts allowed per visitor per window. INSIDE914_HOLD_ATTEMPTS_MAX may RAISE the limit
// (the e2e suite places many holds from one address); it can never switch the limit off.
export function holdAttemptLimit() {
  const configured = Number(process.env.INSIDE914_HOLD_ATTEMPTS_MAX);
  return { max: Number.isInteger(configured) && configured > 10 ? configured : 10, windowSeconds: 10 * 60 };
}

// The first address in x-forwarded-for (set by Vercel), else x-real-ip.
export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

// Keyed hash of the address: the database never sees or stores the address itself.
export function visitorHash(address: string, secret: string) {
  return createHmac("sha256", secret).update(`inside914-hold-rate:${address}`).digest("hex");
}

// Records the attempt; false once the visitor is over the limit.
export async function allowHoldAttempt(admin: SupabaseClient<Database>, hash: string) {
  const { max, windowSeconds } = holdAttemptLimit();
  const { data, error } = await admin.rpc("note_hold_attempt", { p_visitor_hash: hash, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw new Error(`note_hold_attempt failed: ${error.message}`);
  return data === true;
}
