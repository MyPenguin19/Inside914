import { REGIONS } from "@/lib/catalog/regions";
import { findTemplate } from "./layouts";
import { isConfirmed, paymentReadinessDetail, type AdminBooking, type AdminEdition, type AdminSlot } from "./metrics";

// Read-only operational checklist. This is never authorization to collect money.
export function zoneReadiness(edition: AdminEdition, slots: AdminSlot[], bookings: AdminBooking[], consents: Map<string, { amountCents: number }>) {
  const own = slots.filter(s => s.editionId === edition.id);
  const confirmed = bookings.filter(b => b.editionId === edition.id && isConfirmed(b));
  const categories = new Map<string, number>();
  const claims = new Map<string, number>();
  for (const b of confirmed) {
    if (b.categoryId) categories.set(b.categoryId, (categories.get(b.categoryId) ?? 0) + 1);
    for (const c of b.claims.filter(c => !c.released)) claims.set(c.slotId, (claims.get(c.slotId) ?? 0) + 1);
  }
  const valid = confirmed.filter(b => {
    const live = b.claims.filter(c => !c.released);
    return b.status === "reserved" && b.size === "standard" && b.priceCents === 39900 && !!b.confirmedAt &&
      !!b.stripeCustomerId && !["failed", "canceled"].includes(b.stripeSetupStatus ?? "") &&
      !!b.categoryId && categories.get(b.categoryId) === 1 && live.length === 1 && claims.get(live[0].slotId) === 1 &&
      own.some(s => s.id === live[0].slotId && !s.blockedAt) && paymentReadinessDetail(b, consents.get(b.id)).ready;
  });
  const template = findTemplate(edition.layoutTemplate ?? "");
  const inventoryReady = own.length === 10 && template?.slots.length === 10 && template.slots.every(t =>
    own.some(s => s.side === t.side && s.label === t.label && s.x === t.x && s.y === t.y && s.width === t.width && s.height === t.height && !s.blockedAt));
  const artworkReady = valid.filter(b => b.artwork?.status === "ready" && b.artwork.square && b.artworkReview === "approved").length;
  const checks = [
    { label: "Ten paid positions (six front, four back)", ready: !!inventoryReady },
    { label: `${valid.length} of 10 valid confirmed reservations`, ready: valid.length === 10 && confirmed.length === 10 },
    { label: "One normalized category per reservation, no conflicts", ready: confirmed.length > 0 && confirmed.every(b => !!b.stripeCustomerId && !["failed", "canceled"].includes(b.stripeSetupStatus ?? "") &&
      !!b.categoryId && categories.get(b.categoryId) === 1) },
    { label: `${artworkReady} of 10 square artworks approved`, ready: artworkReady === 10 },
    { label: "Reservations closed for production review", ready: edition.status === "closed" && !edition.pausedAt },
    { label: "Printer layout approved", ready: template?.approved === true },
    { label: "Mailing window configured", ready: !!edition.mailingWindowStart && !!edition.mailingWindowEnd && edition.mailingWindowStart <= edition.mailingWindowEnd },
    { label: "House artwork and final proof approved", ready: false },
  ];
  return { validCount: valid.length, checks, ready: checks.every(c => c.ready) };
}

// One explicitly named campaign per zone; never combine months into a fill count.
export function zoneCampaigns(editions: AdminEdition[]) {
  return REGIONS.map(region => ({ ...region, campaign: editions.filter(e => e.productModel === "square_v1" && e.zoneName === region.name && !["cancelled", "completed", "mailed"].includes(e.status))
    .sort((a,b) => Number(b.status === "open") - Number(a.status === "open") || a.issueMonth.localeCompare(b.issueMonth) || a.id.localeCompare(b.id))[0] ?? null }));
}
