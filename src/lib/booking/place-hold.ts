import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { createHoldToken } from "./hold-token";

export const HOLD_COOKIE = "inside914_hold";

export type HoldFailure = "invalid_input" | "slot_not_found" | "edition_closed" | "slot_unavailable" | "error";

export type HoldResult =
  | { ok: true; reservationId: string; expiresAt: string; token: string }
  | { ok: false; reason: HoldFailure };

const HoldInput = z.object({ slotId: z.uuid() });

// SQLSTATEs raised by public.hold_slot().
const DB_ERRORS: Record<string, HoldFailure> = {
  INS01: "slot_not_found",
  INS02: "edition_closed",
  INS03: "slot_unavailable",
};

// Takes the secret-key client: hold_slot() is executable only by service_role.
export async function placeHold(admin: SupabaseClient<Database>, raw: unknown): Promise<HoldResult> {
  const input = HoldInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid_input" };

  const { token, hash } = createHoldToken();
  const { data, error } = await admin
    .rpc("hold_slot", { p_slot_id: input.data.slotId, p_token_hash: hash })
    .single();

  if (error) {
    const reason = DB_ERRORS[error.code];
    if (reason) return { ok: false, reason };
    console.error("hold_slot failed", error.code, error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true, reservationId: data.reservation_id, expiresAt: data.hold_expires_at, token };
}
