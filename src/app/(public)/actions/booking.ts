"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { releaseHold } from "@/lib/booking/held-booking";
import { HOLD_COOKIE, placeHold, type HoldFailure } from "@/lib/booking/place-hold";
import { isSelectionAvailable, type Availability } from "@/lib/booking/selection";
import { getAvailability } from "@/lib/catalog/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export type HoldSelectionResult =
  | { ok: true }
  | { ok: false; reason: HoldFailure; availability?: Availability };

const HoldSelectionInput = z.object({
  editionId: z.uuid(),
  slotIds: z.array(z.uuid()).min(1).max(2),
});

// Re-checks availability, then places one atomic hold (1 or 2 slots). The token goes into an
// httpOnly cookie; on a lost race the caller gets fresh availability to redraw the postcard.
export async function holdSelection(raw: unknown): Promise<HoldSelectionResult> {
  const input = HoldSelectionInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid_input" };
  const { editionId, slotIds } = input.data;

  try {
    const fresh = await getAvailability(editionId);
    if (!isSelectionAvailable(slotIds, fresh)) return { ok: false, reason: "slot_unavailable", availability: fresh };

    const admin = createAdminClient();
    const cookieStore = await cookies();
    const previous = cookieStore.get(HOLD_COOKIE)?.value;
    if (previous) await releaseHold(admin, previous);

    const result = await placeHold(admin, { slotIds });
    if (!result.ok) {
      const availability = result.reason === "slot_unavailable" ? await getAvailability(editionId) : undefined;
      return { ok: false, reason: result.reason, availability };
    }

    cookieStore.set(HOLD_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(result.expiresAt),
    });
    return { ok: true };
  } catch (error) {
    console.error("holdSelection failed", error);
    return { ok: false, reason: "error" };
  }
}

// "Change selection": gives the held positions back and returns to the edition.
export async function releaseCurrentHold(formData: FormData) {
  const editionId = z.uuid().safeParse(formData.get("editionId"));
  const cookieStore = await cookies();
  const token = cookieStore.get(HOLD_COOKIE)?.value;
  if (token) {
    try {
      await releaseHold(createAdminClient(), token);
    } catch (error) {
      // The hold still expires on its own within 15 minutes.
      console.error("releaseCurrentHold failed", error);
    }
    cookieStore.delete(HOLD_COOKIE);
  }
  redirect(editionId.success ? `/editions/${editionId.data}` : "/#editions");
}
