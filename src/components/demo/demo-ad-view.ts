import { adArea } from "@/lib/artwork/rules";
import type { ReservationView } from "@/lib/checkout/reservation";
import { DEMO_EDITION, DEMO_REFERENCE } from "@/lib/demo/data";
import type { DemoArtwork, DemoContact, DemoSelection } from "./demo-store";

// Builds the same shape the real summary/confirmation components render, from preview state.
export function demoReservationView(selection: DemoSelection, artwork: DemoArtwork | null, contact: DemoContact | null): ReservationView {
  const own = DEMO_EDITION.slots.filter((s) => selection.slotIds.includes(s.id));
  return {
    bookingId: "design-preview",
    status: "reserved",
    isTest: false,
    reference: DEMO_REFERENCE,
    confirmedAt: null,
    businessName: contact?.businessName ?? "Your business",
    contactName: contact?.contactName ?? null,
    email: contact?.email ?? null,
    zoneName: DEMO_EDITION.zoneName,
    households: DEMO_EDITION.households,
    issueMonth: DEMO_EDITION.issueMonth,
    artworkDeadline: DEMO_EDITION.artworkDeadline,
    size: selection.size,
    priceCents: selection.priceCents,
    positions: own.map((s) => ({ label: s.label, side: s.side })),
    area: adArea(own),
    otherSlots: DEMO_EDITION.slots.filter((s) => s.side === selection.side && !selection.slotIds.includes(s.id)),
    artwork: artwork?.crop
      ? { id: "preview", contentType: "image/png", width: artwork.width, height: artwork.height, viewUrl: artwork.src, crop: artwork.crop, zoom: artwork.zoom }
      : null,
  };
}
