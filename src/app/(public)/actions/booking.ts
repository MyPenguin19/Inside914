"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getHeldBooking, releaseHold } from "@/lib/booking/held-booking";
import { HOLD_COOKIE, type HoldFailure } from "@/lib/booking/place-hold";
import type { Availability } from "@/lib/booking/selection";
import { createAdminClient } from "@/lib/supabase/admin";

export type HoldSelectionResult =
  | { ok: true }
  | { ok: false; reason: HoldFailure; availability?: Availability };

// Legacy position-first entrypoint is disconnected; existing holds remain readable.
export async function holdSelection(): Promise<HoldSelectionResult> {
  return { ok: false, reason: "invalid_selection" };
}

// "Change selection": gives the held positions back and returns to the edition.
export async function releaseCurrentHold(formData: FormData) {
  const editionId = z.uuid().safeParse(formData.get("editionId"));
  const cookieStore = await cookies();
  const token = cookieStore.get(HOLD_COOKIE)?.value;
  if (token) {
    if ((await getHeldBooking(createAdminClient(), token))?.cartId) redirect("/book/cart");
    try {
      const admin = createAdminClient();
      await releaseHold(admin, token);
    } catch (error) {
      // The hold still expires on its own within 15 minutes.
      console.error("releaseCurrentHold failed", error);
    }
    cookieStore.delete(HOLD_COOKIE);
  }
  redirect(editionId.success ? `/editions/${editionId.data}` : "/areas");
}
