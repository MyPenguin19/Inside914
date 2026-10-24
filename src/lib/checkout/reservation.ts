import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getArtwork, type ArtworkView } from "@/lib/artwork/service";
import { adArea, adAreas, type SlotGeometry } from "@/lib/artwork/rules";
import { getEditionCatalog } from "@/lib/catalog/queries";
import { isTestStripeId } from "@/lib/dev/test-mode";
import type { Database } from "@/lib/supabase/database.types";

// Everything shown about one booking on the summary, confirmation and reservation pages and in
// the confirmation email. Callers must have authorized access to this booking first.

type Admin = SupabaseClient<Database>;

export type ReservationView = {
  productModel?: string;
  layoutTemplate?: string | null;
  bookingId: string;
  status: string;
  isTest: boolean; // development TEST reservation (simulated card, no payment method, no authorization)
  card: "removed" | "pending" | "none" | "shared"; // saved card: removed in Stripe, still attached, or never saved
  pricingMode: "launch" | "test"; // test = temporary $1 / $2 prices (with test or live Stripe keys)
  editionId: string;
  campaign: { taken: number; total: number }; // spaces held or reserved on this edition
  emailSent: boolean; // the confirmation email was actually sent (not just queued)
  reference: string | null;
  confirmedAt: string | null;
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  campaignName?: string;
  zoneName: string;
  households: number;
  issueMonth: string;
  artworkDeadline: string;
  size: import("@/lib/booking/products").BookingSize;
  priceCents: number;
  positions: { label: string; side: "front" | "back" }[];
  area: SlotGeometry;
  areas?: SlotGeometry[];
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
  pricing_mode: string;
  edition_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_removed_at: string | null;
  editions: { name: string } | null;
  booking_contacts: { business_name: string; contact_name: string; email: string } | null;
  booking_slots: { released_at: string | null; slots: { label: string; side: string; x_in: number; y_in: number; width_in: number; height_in: number } | null }[];
};

export async function getReservationView(admin: Admin, bookingId: string): Promise<ReservationView | null> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, reference, confirmed_at, size, price_cents, pricing_mode, edition_id, stripe_customer_id, stripe_payment_method_id, card_removed_at, editions(name), booking_contacts(business_name, contact_name, email), booking_slots(released_at, slots(label, side, x_in, y_in, width_in, height_in))",
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

  const [catalog, artwork, email] = await Promise.all([
    getEditionCatalog(data.edition_id, { priced: false }), // this view shows the booking's stored price
    getArtwork(admin, data.id),
    admin.from("email_outbox").select("status").eq("booking_id", data.id).eq("status", "sent").limit(1),
  ]);
  if (!catalog) return null;
  let sharedCard = false;
  if (data.status === "cancelled" && data.stripe_payment_method_id && !data.card_removed_at) {
    const active = await admin.from("bookings").select("id").eq("stripe_payment_method_id", data.stripe_payment_method_id)
      .not("status", "in", "(cancelled,released)").limit(1);
    if (active.error) throw active.error;
    sharedCard = Boolean(active.data?.length);
  }
  const own = new Set(slots.map((s) => s.label));
  return {
    bookingId: data.id,
    productModel: catalog.productModel,
    layoutTemplate: catalog.layoutTemplate,
    status: data.status,
    isTest: isTestStripeId(data.stripe_customer_id),
    card: !data.stripe_payment_method_id ? "none" : data.card_removed_at ? "removed" : sharedCard ? "shared" : "pending",
    pricingMode: data.pricing_mode === "test" ? "test" : "launch",
    editionId: data.edition_id,
    campaign: { taken: catalog.slots.filter((s) => s.occupancy === "reserved").length, total: catalog.slots.length },
    emailSent: (email.data?.length ?? 0) > 0,
    reference: data.reference,
    confirmedAt: data.confirmed_at,
    businessName: data.booking_contacts?.business_name ?? null,
    contactName: data.booking_contacts?.contact_name ?? null,
    email: data.booking_contacts?.email ?? null,
    campaignName: data.editions?.name,
    zoneName: catalog.zoneName,
    households: catalog.households,
    issueMonth: catalog.issueMonth,
    artworkDeadline: catalog.artworkDeadline,
    size: data.size as import("@/lib/booking/products").BookingSize,
    priceCents: data.price_cents,
    positions: slots.map((s) => ({ label: s.label, side: s.side })),
    area: adArea(slots),
    areas: adAreas(slots),
    otherSlots: catalog.slots.filter((s) => s.side === slots[0].side && !own.has(s.label)),
    artwork,
  };
}
