import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { pricesFor } from "@/lib/pricing";
import { createHoldToken } from "./hold-token";

export const HOLD_COOKIE = "inside914_hold";

export type HoldFailure =
  | "invalid_input"
  | "invalid_selection"
  | "slot_not_found"
  | "edition_closed"
  | "slot_unavailable"
  | "rate_limited"
  | "invalid_pricing"
  | "error";

export type HoldResult =
  | { ok: true; bookingId: string; expiresAt: string; size: "standard" | "double"; priceCents: number; token: string }
  | { ok: false; reason: HoldFailure };

const HoldInput = z.object({ slotIds: z.array(z.uuid()).min(1).max(2) });

// SQLSTATEs raised by public.hold_slots().
const DB_ERRORS: Record<string, HoldFailure> = {
  INS01: "slot_not_found",
  INS02: "edition_closed",
  INS03: "slot_unavailable",
  INS04: "invalid_selection",
  INS05: "invalid_pricing",
};

// One atomic hold for 1 slot (standard) or 2 adjacent slots (double), at the price the server's
// pricing configuration sets (see lib/pricing). Takes the secret-key client: hold_slots() is
// executable only by service_role. The browser never supplies a price.
export async function placeHold(admin: SupabaseClient<Database>, raw: unknown): Promise<HoldResult> {
  const input = HoldInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid_input" };

  const { data: slot, error: slotError } = await admin
    .from("slots")
    .select("editions(unit_price_cents, double_unit_price_cents)")
    .eq("id", input.data.slotIds[0])
    .maybeSingle();
  if (slotError) {
    console.error("hold pricing lookup failed", slotError.code);
    return { ok: false, reason: "error" };
  }
  if (!slot?.editions) return { ok: false, reason: "slot_not_found" };

  let prices;
  try {
    prices = pricesFor({ unitPriceCents: slot.editions.unit_price_cents, doublePriceCents: slot.editions.double_unit_price_cents });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "pricing configuration error");
    return { ok: false, reason: "error" };
  }

  const { token, hash } = createHoldToken();
  const { data, error } = await admin
    .rpc("hold_slots", {
      p_slot_ids: input.data.slotIds,
      p_token_hash: hash,
      p_pricing_mode: prices.mode,
      p_unit_price_cents: prices.unitPriceCents,
      p_double_price_cents: prices.doublePriceCents,
    })
    .single();

  if (error) {
    const reason = DB_ERRORS[error.code];
    if (reason) return { ok: false, reason };
    console.error("hold_slots failed", error.code, error.message);
    return { ok: false, reason: "error" };
  }
  return {
    ok: true,
    bookingId: data.booking_id,
    expiresAt: data.hold_expires_at,
    size: data.size as "standard" | "double",
    priceCents: data.price_cents,
    token,
  };
}
