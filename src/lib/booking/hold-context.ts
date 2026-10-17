import "server-only";
import { cookies } from "next/headers";
import { getArtwork, type ArtworkView } from "@/lib/artwork/service";
import { adArea, type SlotGeometry } from "@/lib/artwork/rules";
import { getEditionCatalog } from "@/lib/catalog/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHeldBooking, type HeldBooking } from "./held-booking";
import { HOLD_COOKIE } from "./place-hold";

export type HoldContext =
  | { kind: "none" }
  | { kind: "expired"; editionId: string }
  | { kind: "error" }
  | {
      kind: "active";
      booking: HeldBooking;
      area: SlotGeometry; // the ad's printable area (union of both units for a double)
      otherSlots: SlotGeometry[]; // other positions on the same side, for the full-card preview
      artwork: ArtworkView | null;
    };

// Everything the artwork and review pages need about the visitor's current hold.
export async function loadHoldContext(): Promise<HoldContext> {
  const token = (await cookies()).get(HOLD_COOKIE)?.value;
  if (!token) return { kind: "none" };
  try {
    const admin = createAdminClient();
    const booking = await getHeldBooking(admin, token);
    if (!booking || !booking.positions.length) return { kind: "none" };
    if (booking.state === "expired") return { kind: "expired", editionId: booking.editionId };

    const side = booking.positions[0].side;
    const own = new Set(booking.positions.map((p) => p.label));
    const [catalog, artwork] = await Promise.all([getEditionCatalog(booking.editionId), getArtwork(admin, booking.id)]);
    const otherSlots = (catalog?.slots ?? []).filter((s) => s.side === side && !own.has(s.label));
    return { kind: "active", booking, area: adArea(booking.positions), otherSlots, artwork };
  } catch (error) {
    console.error("loadHoldContext failed", error);
    return { kind: "error" };
  }
}
