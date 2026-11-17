import "server-only";
import { placementPrice } from "./placement-price";
import { assertCheckoutReleased } from "@/lib/checkout/release";
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
  | { ok: true; bookingId: string; expiresAt: string; size: import("@/lib/booking/products").BookingSize; priceCents: number; token: string }
  | { ok: false; reason: HoldFailure };

const HoldInput = z.object({ slotIds: z.array(z.uuid()).min(1).max(256), mode: z.enum(["standard", "double", "full_side", "both_sides"]).optional() }).refine(input => {
  if (input.mode === "full_side" || input.mode === "both_sides") return true;
  return input.mode === "standard" ? input.slotIds.length === 1 : input.mode === "double" ? input.slotIds.length === 2 : input.slotIds.length <= 2;
});

// SQLSTATEs raised by public.hold_slots().
const DB_ERRORS: Record<string, HoldFailure> = {
  INS01: "slot_not_found",
  INS02: "edition_closed",
  INS03: "slot_unavailable",
  INS04: "invalid_selection",
  INS05: "invalid_pricing",
};

// One atomic hold for standard, double, full-side or both-sides inventory at server-owned
// prices (see lib/pricing). Takes the secret-key client: both hold RPCs are
// executable only by service_role. The browser never supplies a price.
export async function placeHold(admin: SupabaseClient<Database>, raw: unknown): Promise<HoldResult> {
  assertCheckoutReleased();
  const input = HoldInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid_input" };

  const { data: slot, error: slotError } = await admin
    .from("slots")
    .select("side, editions(product_model, unit_price_cents, back_unit_price_cents, double_unit_price_cents)")
    .eq("id", input.data.slotIds[0])
    .maybeSingle();
  if (slotError) {
    console.error("hold pricing lookup failed", slotError.code);
    return { ok: false, reason: "error" };
  }
  if (!slot?.editions) return { ok: false, reason: "slot_not_found" };

  let prices;
  try {
    prices = pricesFor({ productModel: slot.editions.product_model, unitPriceCents: slot.editions.unit_price_cents, backUnitPriceCents: slot.editions.back_unit_price_cents, doublePriceCents: slot.editions.double_unit_price_cents });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "pricing configuration error");
    return { ok: false, reason: "error" };
  }

  const { token, hash } = createHoldToken();
  const full = input.data.mode === "full_side" || input.data.mode === "both_sides";
  const request = full ? admin.rpc("hold_postcard", {
    p_slot_ids: input.data.slotIds, p_size: input.data.mode!, p_token_hash: hash, p_pricing_mode: prices.mode,
  }) : admin.rpc("hold_slots", {
      p_slot_ids: input.data.slotIds,
      p_token_hash: hash,
      p_pricing_mode: prices.mode,
      p_unit_price_cents: placementPrice(prices, slot.side as "front" | "back"),
      p_double_price_cents: prices.doublePriceCents,
    });
  const { data, error } = await request.single();

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
    size: data.size as import("@/lib/booking/products").BookingSize,
    priceCents: data.price_cents,
    token,
  };
}
