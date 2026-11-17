import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CheckoutBooking } from "@/lib/checkout/service";
import { ownedCart } from "./cart";
import { hashHoldToken } from "./hold-token";

export function isActiveHold(booking: CheckoutBooking) {
  return booking.status === "pending" && !!booking.holdExpiresAt && Date.parse(booking.holdExpiresAt) > Date.now();
}
export function canChangePosition(booking: CheckoutBooking) {
  return booking.productModel === "square_v1" && booking.size === "standard" && isActiveHold(booking);
}

const ChangePosition = z.object({ bookingId: z.uuid(), currentSlotId: z.uuid(), slotId: z.uuid() });
export async function changePosition(admin: SupabaseClient<Database>, token: string | undefined, raw: unknown) {
  const input = ChangePosition.safeParse(raw);
  if (!input.success || !token) return { ok: false as const, message: "This hold is unavailable. Return to your areas to review it." };
  const cart = await ownedCart(admin, token);
  const member = cart?.members.find(b => b.id === input.data.bookingId);
  if (!member || !canChangePosition(member)) return { ok: false as const, message: "This hold is unavailable. Return to your areas to review it." };
  const { error } = await admin.rpc("change_cart_position", {
    p_cart_hash: hashHoldToken(token), p_booking_id: member.id,
    p_expected_slot: input.data.currentSlotId, p_slot_id: input.data.slotId,
  });
  if (error) {
    const message = error.message === "price_change_requires_new_hold"
      ? "Payment authorization has already started. Keep this side, or release your held areas and choose new positions to change the price."
      : error.message === "position_changed"
      ? "Your space changed in another tab. Review your current space and try again."
      : error.message === "hold_unavailable"
        ? "Your hold is no longer available. Return to your areas to review it."
        : error.code === "INS03"
          ? "That space was just taken. Your current space is still held. Choose another."
          : error.code === "INS02"
            ? "This campaign is no longer accepting changes. Your selection was not changed."
            : "We couldn’t change your space. Review your selection and try again.";
    return { ok: false as const, message };
  }
  return { ok: true as const, editionId: member.editionId };
}
