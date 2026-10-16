import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getArtwork, type ArtworkView } from "@/lib/artwork/service";
import { adArea, type SlotGeometry } from "@/lib/artwork/rules";
import { getEditionCatalog } from "@/lib/catalog/queries";
import { isTestStripeId } from "@/lib/dev/test-mode";
import type { Database } from "@/lib/supabase/database.types";

// Everything shown about one booking on the summary, confirmation and reservation pages and in
// the confirmation email. Callers must have authorized access to this booking first.

type Admin = SupabaseClient<Database>;

export type ReservationView = {
  bookingId: string;
  status: string;
  isTest: boolean; // development TEST reservation (simulated card, no payment method, no authorization)
  reference: string | null;
  confirmedAt: string | null;
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  zoneName: string;
  households: number;
  issueMonth: string;
  artworkDeadline: string;
  size: "standard" | "double";
  priceCents: number;
  positions: { label: string; side: "front" | "back" }[];
  area: SlotGeometry;
  otherSlots: SlotGeometry[];
  artwork: ArtworkView | null;
};

type Row = {
  id: string;
  status: string;
  reference: string | null;
  confirmed_at: string | null;
  size: string;
  price_cents: number;
  edition_id: string;
  stripe_customer_id: string | null;
  booking_contacts: { business_name: string; contact_name: string; email: string } | null;
  booking_slots: { released_at: string | null; slots: { label: string; side: string; x_in: number; y_in: number; width_in: number; height_in: number } | null }[];
};

export async function getReservationView(admin: Admin, bookingId: string): Promise<ReservationView | null> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, reference, confirmed_at, size, price_cents, edition_id, stripe_customer_id, booking_contacts(business_name, contact_name, email), booking_slots(released_at, slots(label, side, x_in, y_in, width_in, height_in))",
    )
    .eq("id", bookingId)
    .returns<Row[]>()
    .maybeSingle();
  if (error) throw new Error(`Could not load reservation: ${error.message}`);
  if (!data) return null;

  const slots = data.booking_slots
    .flatMap((bs) => (bs.slots ? [bs.slots] : []))
    .map((s) => ({ label: s.label, side: s.side as "front" | "back", x: Number(s.x_in), y: Number(s.y_in), width: Number(s.width_in), height: Number(s.height_in) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  if (!slots.length) return null;

  const [catalog, artwork] = await Promise.all([getEditionCatalog(data.edition_id), getArtwork(admin, data.id)]);
  if (!catalog) return null;
  const own = new Set(slots.map((s) => s.label));
  return {
    bookingId: data.id,
    status: data.status,
    isTest: isTestStripeId(data.stripe_customer_id),
    reference: data.reference,
    confirmedAt: data.confirmed_at,
    businessName: data.booking_contacts?.business_name ?? null,
    contactName: data.booking_contacts?.contact_name ?? null,
    email: data.booking_contacts?.email ?? null,
    zoneName: catalog.zoneName,
    households: catalog.households,
    issueMonth: catalog.issueMonth,
    artworkDeadline: catalog.artworkDeadline,
    size: data.size as "standard" | "double",
    priceCents: data.price_cents,
    positions: slots.map((s) => ({ label: s.label, side: s.side })),
    area: adArea(slots),
    otherSlots: catalog.slots.filter((s) => s.side === slots[0].side && !own.has(s.label)),
    artwork,
  };
}
