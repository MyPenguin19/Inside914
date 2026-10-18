import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getArtwork } from "@/lib/artwork/service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { AdminBooking, AdminEdition, AdminSlot } from "./metrics";

// Admin data loaders. They take the SIGNED-IN ADMIN's Supabase client (from requireAdmin), so RLS
// ("admins manage ...") decides what is readable, not the secret key. The one exception is
// artwork images (private bucket, no storage policies): signArtwork() uses the server key only
// after the caller has passed requireAdmin().

type Db = SupabaseClient<Database>;

const BOOKING_COLUMNS =
  "id, edition_id, status, size, price_cents, pricing_mode, hold_expires_at, reference, created_at, confirmed_at, stripe_customer_id, stripe_setup_intent_id, stripe_payment_method_id, stripe_setup_status, stripe_setup_status_at, booking_contacts(business_name, contact_name, email, phone), booking_artwork(status, crop_width, updated_at), booking_slots(slot_id, released_at)";

type BookingRow = {
  id: string;
  edition_id: string;
  status: string;
  size: string;
  price_cents: number;
  pricing_mode: string;
  hold_expires_at: string | null;
  reference: string | null;
  created_at: string;
  confirmed_at: string | null;
  stripe_customer_id: string | null;
  stripe_setup_intent_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_setup_status: string | null;
  stripe_setup_status_at: string | null;
  booking_contacts: { business_name: string; contact_name: string; email: string; phone: string } | null;
  booking_artwork: { status: string; crop_width: number | null; updated_at: string } | null;
  booking_slots: { slot_id: string; released_at: string | null }[];
};

const SETUP = new Set(["succeeded", "failed", "canceled"]);

export function toAdminBooking(r: BookingRow): AdminBooking {
  return {
    id: r.id,
    editionId: r.edition_id,
    status: r.status,
    size: r.size === "double" ? "double" : "standard",
    priceCents: r.price_cents,
    pricingMode: r.pricing_mode === "test" ? "test" : "launch",
    holdExpiresAt: r.hold_expires_at,
    reference: r.reference,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    stripeCustomerId: r.stripe_customer_id,
    stripeSetupIntentId: r.stripe_setup_intent_id,
    stripePaymentMethodId: r.stripe_payment_method_id,
    stripeSetupStatus: SETUP.has(r.stripe_setup_status ?? "") ? (r.stripe_setup_status as AdminBooking["stripeSetupStatus"]) : null,
    stripeSetupStatusAt: r.stripe_setup_status_at,
    contact: r.booking_contacts
      ? { businessName: r.booking_contacts.business_name, contactName: r.booking_contacts.contact_name, email: r.booking_contacts.email, phone: r.booking_contacts.phone }
      : null,
    artwork: r.booking_artwork
      ? { status: r.booking_artwork.status, cropped: r.booking_artwork.crop_width !== null, updatedAt: r.booking_artwork.updated_at }
      : null,
    claims: r.booking_slots.map((s) => ({ slotId: s.slot_id, released: s.released_at !== null })),
  };
}

function fail(what: string, error: { message: string } | null): never {
  // The message names the query, never row contents.
  throw new Error(`Admin data: could not load ${what}${error ? ` (${error.message})` : ""}`);
}

type EditionRow = {
  id: string;
  zone_id: string;
  name: string | null;
  target_quantity: number | null;
  layout_template: string | null;
  reservations_open_at: string | null;
  reservations_paused_at: string | null;
  artwork_due_at: string | null;
  mailing_window_start: string | null;
  mailing_window_end: string | null;
  unit_price_cents: number;
  double_unit_price_cents: number | null;
  issue_month: string;
  artwork_deadline: string;
  mail_date: string | null;
  status: string;
  zones: { name: string; household_count: number } | null;
};

const toEdition = (e: EditionRow): AdminEdition => ({
  id: e.id,
  zoneId: e.zone_id,
  name: e.name,
  targetQuantity: e.target_quantity,
  layoutTemplate: e.layout_template,
  reservationsOpenAt: e.reservations_open_at,
  pausedAt: e.reservations_paused_at,
  artworkDueAt: e.artwork_due_at,
  mailingWindowStart: e.mailing_window_start,
  mailingWindowEnd: e.mailing_window_end,
  unitPriceCents: e.unit_price_cents,
  doublePriceCents: e.double_unit_price_cents,
  zoneName: e.zones?.name ?? "Unknown area",
  households: e.target_quantity ?? e.zones?.household_count ?? 0, // the campaign's own target when set
  issueMonth: e.issue_month,
  artworkDeadline: e.artwork_deadline,
  mailDate: e.mail_date,
  status: e.status,
});

export async function listEditions(db: Db): Promise<AdminEdition[]> {
  const { data, error } = await db
    .from("editions")
    .select(
      "id, zone_id, name, target_quantity, layout_template, reservations_open_at, reservations_paused_at, artwork_due_at, mailing_window_start, mailing_window_end, unit_price_cents, double_unit_price_cents, issue_month, artwork_deadline, mail_date, status, zones(name, household_count)",
    )
    .order("issue_month", { ascending: false })
    .returns<EditionRow[]>();
  if (error) fail("campaigns", error);
  return data.map(toEdition);
}

export async function listZones(db: Db) {
  const { data, error } = await db.from("zones").select("id, name").order("name");
  if (error) fail("areas", error);
  return data;
}

export async function hasBookings(db: Db, editionId: string) {
  const { count, error } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("edition_id", editionId).neq("status", "released");
  if (error) fail("bookings", error);
  return (count ?? 0) > 0;
}

export async function listSlots(db: Db, editionIds: string[]): Promise<AdminSlot[]> {
  if (!editionIds.length) return [];
  const { data, error } = await db
    .from("slots")
    .select("id, edition_id, side, label, x_in, y_in, width_in, height_in, blocked_at, blocked_reason")
    .in("edition_id", editionIds)
    .order("side", { ascending: false })
    .order("y_in")
    .order("x_in");
  if (error) fail("slots", error);
  return data.map((s) => ({
    id: s.id,
    editionId: s.edition_id,
    side: s.side === "back" ? "back" : "front",
    label: s.label,
    x: Number(s.x_in),
    y: Number(s.y_in),
    width: Number(s.width_in),
    height: Number(s.height_in),
    blockedAt: s.blocked_at,
    blockedReason: s.blocked_reason,
  }));
}

// Every booking for the given editions (bounded by their inventory), for counts and the postcard.
export async function listEditionBookings(db: Db, editionIds: string[]): Promise<AdminBooking[]> {
  if (!editionIds.length) return [];
  const { data, error } = await db
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .in("edition_id", editionIds)
    .order("created_at", { ascending: false })
    .returns<BookingRow[]>();
  if (error) fail("bookings", error);
  return data.map(toAdminBooking);
}

export async function listSentEmails(db: Db, bookingIds: string[]) {
  if (!bookingIds.length) return [];
  const { data, error } = await db.from("email_outbox").select("booking_id, sent_at").eq("status", "sent").in("booking_id", bookingIds);
  if (error) fail("emails", error);
  return data.filter((e) => e.sent_at).map((e) => ({ bookingId: e.booking_id, sentAt: e.sent_at! }));
}

export const PAGE_SIZE = 25;

export type BookingFilter = "confirmed" | "pending" | "ended" | "all";

// Bookings that reached the details step (they have a contact), filtered, searched and paginated
// in the database. Search matches business, contact name, email or reference.
export async function searchBookings(
  db: Db,
  opts: { filter: BookingFilter; q?: string; editionId?: string; page: number; extra?: "artwork" | "payment" },
) {
  const contacts = "booking_contacts!inner(business_name, contact_name, email, phone)";
  let query = db
    .from("bookings")
    .select(BOOKING_COLUMNS.replace("booking_contacts(business_name, contact_name, email, phone)", contacts), { count: "exact" })
    .order("created_at", { ascending: false });

  if (opts.filter === "confirmed") query = query.not("status", "in", "(pending,released,cancelled)");
  if (opts.filter === "pending") query = query.eq("status", "pending");
  if (opts.filter === "ended") query = query.in("status", ["released", "cancelled"]);
  if (opts.editionId) query = query.eq("edition_id", opts.editionId);
  if (opts.extra === "artwork") query = query.not("booking_artwork", "is", null);
  if (opts.extra === "payment") query = query.not("stripe_setup_intent_id", "is", null);
  const q = opts.q?.trim().replace(/[%,()*\\]/g, " ").slice(0, 80);
  if (q) {
    query = query.or(`business_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%`, { referencedTable: "booking_contacts" });
  }
  const from = (Math.max(1, opts.page) - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1).returns<BookingRow[]>();
  if (error) fail("advertisers", error);
  return { rows: data.map(toAdminBooking), total: count ?? 0 };
}

export async function getBooking(db: Db, id: string) {
  const { data, error } = await db.from("bookings").select(BOOKING_COLUMNS).eq("id", id).returns<BookingRow[]>().maybeSingle();
  if (error) fail("booking", error);
  return data ? toAdminBooking(data) : null;
}

export async function getConsent(db: Db, bookingId: string) {
  const { data, error } = await db
    .from("payment_consents")
    .select("amount_cents, currency, terms_version, consented_at, pricing_mode")
    .eq("booking_id", bookingId)
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("consent", error);
  return data;
}

// Private artwork, viewable through a short-lived signed URL. ONLY call after requireAdmin().
export async function signArtwork(bookingId: string) {
  return getArtwork(createAdminClient(), bookingId);
}
