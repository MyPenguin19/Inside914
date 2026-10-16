"use server";

import { cookies } from "next/headers";
import { HOLD_COOKIE, placeHold, type HoldFailure } from "@/lib/booking/place-hold";
import { createAdminClient } from "@/lib/supabase/admin";

export type HoldSlotResult = { ok: true; reservationId: string; expiresAt: string } | { ok: false; reason: HoldFailure };

// Holds a slot for 15 minutes. The hold token goes into an httpOnly cookie, never to page JS.
export async function holdSlot(input: { slotId: string }): Promise<HoldSlotResult> {
  const result = await placeHold(createAdminClient(), input);
  if (!result.ok) return result;

  (await cookies()).set(HOLD_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(result.expiresAt),
  });
  return { ok: true, reservationId: result.reservationId, expiresAt: result.expiresAt };
}
