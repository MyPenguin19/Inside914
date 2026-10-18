// Pure counting rules for the admin dashboard. Everything is derived from database rows passed in;
// nothing here knows a price or invents a value. Kept free of I/O so the rules are unit-tested.

export type AdminSlot = {
  id: string;
  editionId: string;
  side: "front" | "back";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blockedAt?: string | null; // admin block: not for sale, and never counted as sold
  blockedReason?: string | null;
};

export type AdminBooking = {
  id: string;
  editionId: string;
  status: string;
  size: "standard" | "double";
  priceCents: number; // the amount stored on the booking (what was authorized), never recomputed
  pricingMode: "launch" | "test";
  holdExpiresAt: string | null;
  reference: string | null;
  createdAt: string;
  confirmedAt: string | null;
  stripeCustomerId: string | null;
  stripeSetupIntentId: string | null;
  stripePaymentMethodId: string | null;
  stripeSetupStatus: "succeeded" | "failed" | "canceled" | null;
  stripeSetupStatusAt: string | null;
  contact: { businessName: string; contactName: string; email: string; phone: string } | null;
  artwork: { status: string; cropped: boolean; updatedAt: string } | null;
  claims: { slotId: string; released: boolean }[];
  flag?: { at: string; reason: string } | null;
  cancellation?: { at: string; reason: string } | null;
  artworkId?: string | null;
  artworkReview?: "pending" | "approved" | "rejected" | "changes_requested";
  artworkReviewNote?: string | null;
};

export type AdminEdition = {
  id: string;
  zoneId?: string;
  name?: string | null; // campaign name (older editions have none)
  targetQuantity?: number | null;
  layoutTemplate?: string | null;
  reservationsOpenAt?: string | null;
  pausedAt?: string | null;
  artworkDueAt?: string | null;
  mailingWindowStart?: string | null;
  mailingWindowEnd?: string | null;
  unitPriceCents?: number;
  doublePriceCents?: number | null;
  zoneName: string;
  households: number;
  issueMonth: string;
  artworkDeadline: string;
  mailDate: string | null;
  status: string;
};

// Bookings that ended without a reservation. Everything else past "pending" is a confirmed
// reservation in some stage (reserved, submitted, approved, charge_failed, charged, rejected).
const ENDED = new Set(["released", "cancelled"]);

export const isConfirmed = (b: AdminBooking) => b.status !== "pending" && !ENDED.has(b.status);

// A pending hold counts only until it expires: exactly the database's rule (private.slot_claim).
export const isLiveHold = (b: AdminBooking, now: number) =>
  b.status === "pending" && b.holdExpiresAt !== null && Date.parse(b.holdExpiresAt) > now;

export type SlotState = { state: "available" | "held" | "reserved" | "blocked" | "closed"; booking: AdminBooking | null };

// Who occupies each slot right now: a live claim of a confirmed booking (reserved) or of an
// unexpired hold (held). Released claims and expired holds leave the slot free.
// Same rule as private.edition_is_bookable(): open, not paused, opened, before the deadline.
export function isBookable(edition: AdminEdition, now: number) {
  return (
    edition.status === "open" &&
    !edition.pausedAt &&
    (!edition.reservationsOpenAt || Date.parse(edition.reservationsOpenAt) <= now) &&
    Date.parse(edition.artworkDeadline) > now
  );
}

export function slotStates(edition: AdminEdition, slots: AdminSlot[], bookings: AdminBooking[], now: number) {
  const open = isBookable(edition, now);
  const holder = new Map<string, AdminBooking>();
  for (const b of bookings) {
    if (b.editionId !== edition.id || !(isConfirmed(b) || isLiveHold(b, now))) continue;
    for (const c of b.claims) if (!c.released) holder.set(c.slotId, b);
  }
  const states = new Map<string, SlotState>();
  for (const s of slots) {
    if (s.editionId !== edition.id) continue;
    const b = holder.get(s.id) ?? null;
    states.set(s.id, { state: b ? (isConfirmed(b) ? "reserved" : "held") : s.blockedAt ? "blocked" : open ? "available" : "closed", booking: b });
  }
  return states;
}

export type CampaignStats = {
  totalUnits: number;
  blockedUnits: number; // taken off sale by an admin: not sold, not sellable
  sellableUnits: number; // total minus blocked
  reservedUnits: number; // a double ad counts as two units
  heldUnits: number;
  availableUnits: number;
  filledPercent: number; // reserved units / sellable units
  fullyReserved: boolean; // every sellable unit has a confirmed reservation (says nothing about payment)
  reservations: number; // a double ad counts as one reservation
  advertisers: number; // distinct businesses with a confirmed reservation
  reservedValueCents: number; // sum of the confirmed bookings' stored amounts (not collected revenue)
  paymentMethodsReady: number; // confirmed reservations with a saved payment method
  artworkAwaitingReview: number; // confirmed reservations whose ready artwork hasn't been reviewed (no review step exists yet)
  testPricedReservations: number;
};

export function campaignStats(edition: AdminEdition, slots: AdminSlot[], bookings: AdminBooking[], now: number): CampaignStats {
  const states = [...slotStates(edition, slots, bookings, now).values()];
  const confirmed = bookings.filter((b) => b.editionId === edition.id && isConfirmed(b));
  const reservedUnits = states.filter((s) => s.state === "reserved").length;
  const totalUnits = states.length;
  const blockedUnits = states.filter((s) => s.state === "blocked").length;
  const sellableUnits = totalUnits - blockedUnits;
  return {
    totalUnits,
    blockedUnits,
    sellableUnits,
    reservedUnits,
    heldUnits: states.filter((s) => s.state === "held").length,
    availableUnits: states.filter((s) => s.state === "available").length,
    filledPercent: sellableUnits ? Math.round((reservedUnits / sellableUnits) * 100) : 0,
    fullyReserved: sellableUnits > 0 && reservedUnits === sellableUnits,
    reservations: confirmed.length,
    advertisers: new Set(confirmed.map(advertiserKey)).size,
    reservedValueCents: confirmed.reduce((sum, b) => sum + b.priceCents, 0),
    paymentMethodsReady: confirmed.filter((b) => b.stripePaymentMethodId).length,
    artworkAwaitingReview: confirmed.filter(artworkAwaitingReview).length,
    testPricedReservations: confirmed.filter((b) => b.pricingMode === "test").length,
  };
}

// One business = one advertiser, however many reservations it holds (same email, case-insensitive).
export function advertiserKey(b: AdminBooking) {
  return b.contact?.email.trim().toLowerCase() || `booking:${b.id}`;
}

// Uploaded, positioned, on a confirmed reservation, and not yet reviewed (any decision ends the wait).
export const artworkAwaitingReview = (b: AdminBooking) =>
  isConfirmed(b) && b.artwork?.status === "ready" && b.artwork.cropped && (b.artworkReview ?? "pending") === "pending";

export type PaymentReadiness = "ready" | "failed" | "canceled" | "in_progress" | "not_started";

// Saved card readiness from what's stored: the payment method id (set only by a verified
// confirmation) and the latest webhook-reported SetupIntent status.
export function paymentReadiness(b: AdminBooking): PaymentReadiness {
  if (b.stripePaymentMethodId) return "ready";
  if (b.stripeSetupStatus === "failed") return "failed";
  if (b.stripeSetupStatus === "canceled") return "canceled";
  if (b.stripeSetupIntentId) return "in_progress";
  return "not_started";
}

export type AttentionItem = { key: string; title: string; detail: string; href: string; tone: "warning" | "danger" | "info" };

const DAY = 24 * 60 * 60 * 1000;

export function attentionItems(edition: AdminEdition | null, stats: CampaignStats | null, bookings: AdminBooking[], now: number): AttentionItem[] {
  const items: AttentionItem[] = [];
  const awaiting = bookings.filter(artworkAwaitingReview).length;
  if (awaiting) {
    items.push({ key: "artwork", tone: "warning", href: "/admin/artwork", title: `${awaiting} artwork ${awaiting === 1 ? "submission" : "submissions"} awaiting review`, detail: "Check each ad before the campaign is approved for print." });
  }
  const noCard = bookings.filter((b) => isConfirmed(b) && !b.stripePaymentMethodId).length;
  if (noCard) {
    items.push({ key: "payment-missing", tone: "danger", href: "/admin/payments", title: `${noCard} confirmed ${noCard === 1 ? "reservation has" : "reservations have"} no saved payment method`, detail: "These can't be charged when the campaign fills." });
  }
  const failedSetups = bookings.filter((b) => b.status === "pending" && b.stripeSetupStatus === "failed" && isLiveHold(b, now)).length;
  if (failedSetups) {
    items.push({ key: "payment-failed", tone: "warning", href: "/admin/payments", title: `${failedSetups} card ${failedSetups === 1 ? "setup" : "setups"} failed during checkout`, detail: "The customer can still retry while their hold lasts." });
  }
  // Card saved but the hold ran out before confirmation: no reservation exists, the card was detached.
  const orphaned = bookings.filter((b) => b.status !== "pending" && !isConfirmed(b) && b.stripeSetupStatus === "succeeded").length;
  const lostInventory = bookings.filter((b) => isConfirmed(b) && b.claims.filter((c) => !c.released).length !== (b.size === "double" ? 2 : 1)).length;
  if (orphaned + lostInventory) {
    items.push({ key: "investigate", tone: "danger", href: "/admin/advertisers", title: `${orphaned + lostInventory} ${orphaned + lostInventory === 1 ? "booking needs" : "bookings need"} investigation`, detail: [orphaned && `${orphaned} saved a card after the hold expired`, lostInventory && `${lostInventory} confirmed without all of their spaces`].filter(Boolean).join("; ") + "." });
  }
  if (edition && stats && edition.status === "open") {
    const left = Date.parse(edition.artworkDeadline) - now;
    if (left > 0 && left <= 7 * DAY && stats.availableUnits > 0) {
      items.push({ key: "deadline", tone: "warning", href: `/admin/campaigns/${edition.id}`, title: `Reservation deadline in ${Math.ceil(left / DAY)} ${Math.ceil(left / DAY) === 1 ? "day" : "days"}`, detail: `${stats.availableUnits} of ${stats.totalUnits} spaces are still open.` });
    }
  }
  return items;
}

export type Activity = { at: string; title: string; detail: string; href?: string };

// Real events only, read from timestamps the system already stores. No event table exists yet.
export function recentActivity(bookings: AdminBooking[], emailsSent: { bookingId: string; sentAt: string }[], limit = 8): Activity[] {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const name = (b?: AdminBooking) => b?.contact?.businessName ?? "A business";
  const events: Activity[] = [];
  for (const b of bookings) {
    if (b.confirmedAt) {
      events.push({ at: b.confirmedAt, title: "Reservation confirmed", detail: `${name(b)} · ${b.reference ?? "no reference"}`, href: `/admin/advertisers/${b.id}` });
    }
    if (b.stripeSetupStatus === "failed" && b.stripeSetupStatusAt) {
      events.push({ at: b.stripeSetupStatusAt, title: "Card setup failed", detail: name(b), href: `/admin/advertisers/${b.id}` });
    }
  }
  for (const e of emailsSent) {
    events.push({ at: e.sentAt, title: "Confirmation email sent", detail: name(byId.get(e.bookingId)), href: `/admin/advertisers/${e.bookingId}` });
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

export type ReadinessCheck = { ready: boolean; blockers: string[] };

// Payment-ready = could be charged when the owner approves collection (a later task). Every rule
// must hold; each failing one is listed. Nothing here charges anything.
export function paymentReadinessDetail(b: AdminBooking, consent: { amountCents: number } | undefined): ReadinessCheck {
  const blockers: string[] = [];
  if (!isConfirmed(b)) blockers.push("Not a confirmed reservation");
  const live = b.claims.filter((c) => !c.released).length;
  if (live !== (b.size === "double" ? 2 : 1)) blockers.push("Its spaces aren't all allocated");
  if (!consent) blockers.push("No future-charge consent on record");
  else if (consent.amountCents !== b.priceCents) blockers.push("Consent amount differs from the reservation amount");
  if (!b.stripePaymentMethodId) blockers.push(b.stripeSetupStatus === "failed" ? "Card setup failed" : "No saved card");
  if (!(b.priceCents > 0)) blockers.push("Invalid amount");
  if (b.status === "charge_failed") blockers.push("A previous charge failed");
  if (b.status === "charged") blockers.push("Already charged");
  if (b.flag) blockers.push("Flagged for investigation");
  return { ready: blockers.length === 0, blockers };
}
