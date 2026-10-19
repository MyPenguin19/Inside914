import { describe, expect, test } from "vitest";
import {
  artworkAwaitingReview,
  attentionItems,
  paymentReadinessDetail,
  campaignStats,
  deadlineMissed,
  paymentReadiness,
  recentActivity,
  slotStates,
  type AdminBooking,
  type AdminEdition,
  type AdminSlot,
} from "@/lib/admin/metrics";

const NOW = Date.parse("2026-12-01T12:00:00Z");
const edition: AdminEdition = {
  id: "e1",
  zoneName: "Central Westchester",
  households: 5000,
  issueMonth: "2027-01-01",
  artworkDeadline: "2026-12-16T04:59:59Z",
  mailDate: "2027-01-05",
  status: "open",
};
const slots: AdminSlot[] = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i + 1}`,
  editionId: "e1",
  side: "front",
  label: `F${i + 1}`,
  x: (i % 2) * 3.25,
  y: Math.floor(i / 2) * 3,
  width: 3.25,
  height: 3,
}));

let n = 0;
function booking(overrides: Partial<AdminBooking> & { slotIds: string[] }): AdminBooking {
  const { slotIds, ...rest } = overrides;
  n += 1;
  return {
    id: `b${n}`,
    editionId: "e1",
    status: "reserved",
    size: slotIds.length === 2 ? "double" : "standard",
    priceCents: slotIds.length === 2 ? 200 : 100,
    pricingMode: "test",
    holdExpiresAt: null,
    reference: `IN914-AAAA${n}A`,
    createdAt: "2026-11-30T10:00:00Z",
    confirmedAt: "2026-11-30T10:10:00Z",
    stripeCustomerId: "cus_1",
    stripeSetupIntentId: "seti_1",
    stripePaymentMethodId: "pm_1",
    stripeSetupStatus: "succeeded",
    stripeSetupStatusAt: "2026-11-30T10:09:00Z",
    contact: { businessName: `Business ${n}`, contactName: "Pat", email: `owner${n}@example.com`, phone: "+19145550100" },
    artwork: { status: "ready", cropped: true, updatedAt: "2026-11-30T10:05:00Z" },
    claims: slotIds.map((slotId) => ({ slotId, released: false })),
    ...rest,
  };
}

describe("campaign counts", () => {
  test("a double ad is two units but one reservation and one advertiser", () => {
    const stats = campaignStats(edition, slots, [booking({ slotIds: ["s1", "s2"] })], NOW);
    expect(stats).toMatchObject({ reservedUnits: 2, reservations: 1, advertisers: 1, availableUnits: 6, totalUnits: 8, filledPercent: 25 });
  });

  test("held units are separate from reserved; expired holds count as available", () => {
    const live = booking({ slotIds: ["s3"], status: "pending", holdExpiresAt: "2026-12-01T12:10:00Z", confirmedAt: null, stripePaymentMethodId: null });
    const expired = booking({ slotIds: ["s4"], status: "pending", holdExpiresAt: "2026-12-01T11:00:00Z", confirmedAt: null, stripePaymentMethodId: null });
    const released = booking({ slotIds: ["s5"], status: "released", claims: [{ slotId: "s5", released: true }] });
    const stats = campaignStats(edition, slots, [live, expired, released], NOW);
    expect(stats).toMatchObject({ reservedUnits: 0, heldUnits: 1, availableUnits: 7, reservations: 0, reservedValueCents: 0 });
    const states = slotStates(edition, slots, [live, expired, released], NOW);
    expect(states.get("s3")?.state).toBe("held");
    expect(states.get("s4")?.state).toBe("available");
    expect(states.get("s5")?.state).toBe("available");
  });

  test("advertisers are distinct businesses (same email, any case) across reservations", () => {
    const a = booking({ slotIds: ["s1"] });
    const b = booking({ slotIds: ["s2"], contact: { ...a.contact!, email: a.contact!.email.toUpperCase() } });
    const c = booking({ slotIds: ["s3"] });
    expect(campaignStats(edition, slots, [a, b, c], NOW)).toMatchObject({ reservations: 3, advertisers: 2 });
  });

  test("reserved value is the sum of the amounts stored on confirmed bookings, whatever they are", () => {
    const test1 = booking({ slotIds: ["s1"] }); // $1 test price
    const launch = booking({ slotIds: ["s2", "s3"].slice(0, 1), priceCents: 50000, pricingMode: "launch" });
    const hold = booking({ slotIds: ["s4"], status: "pending", holdExpiresAt: "2026-12-01T13:00:00Z", priceCents: 90000 });
    const stats = campaignStats(edition, slots, [test1, launch, hold], NOW);
    expect(stats.reservedValueCents).toBe(100 + 50000); // holds are not reserved value
    expect(stats.testPricedReservations).toBe(1);
  });

  test("payment methods ready and artwork awaiting review count confirmed reservations only", () => {
    const ready = booking({ slotIds: ["s1"] });
    const noCard = booking({ slotIds: ["s2"], stripePaymentMethodId: null });
    const noArtwork = booking({ slotIds: ["s3"], artwork: null });
    const stats = campaignStats(edition, slots, [ready, noCard, noArtwork], NOW);
    expect(stats.paymentMethodsReady).toBe(2);
    expect(stats.artworkAwaitingReview).toBe(2);
  });

  test("a closed or past-deadline edition has no available units", () => {
    const closed = { ...edition, status: "closed" };
    expect(campaignStats(closed, slots, [], NOW)).toMatchObject({ availableUnits: 0, totalUnits: 8 });
    expect(campaignStats(edition, slots, [], Date.parse("2026-12-20T00:00:00Z")).availableUnits).toBe(0);
  });

  test("an empty campaign is all zeros, not invented numbers", () => {
    expect(campaignStats(edition, [], [], NOW)).toMatchObject({ totalUnits: 0, reservedUnits: 0, filledPercent: 0, advertisers: 0, reservedValueCents: 0 });
  });
});

describe("payment readiness", () => {
  test("follows the stored payment method and webhook-reported setup status", () => {
    expect(paymentReadiness(booking({ slotIds: ["s1"] }))).toBe("ready");
    expect(paymentReadiness(booking({ slotIds: ["s1"], stripePaymentMethodId: null, stripeSetupStatus: "failed" }))).toBe("failed");
    expect(paymentReadiness(booking({ slotIds: ["s1"], stripePaymentMethodId: null, stripeSetupStatus: null }))).toBe("in_progress");
    expect(paymentReadiness(booking({ slotIds: ["s1"], stripePaymentMethodId: null, stripeSetupStatus: null, stripeSetupIntentId: null }))).toBe("not_started");
  });
});

describe("requires attention", () => {
  test("nothing to do: no items (the page then says you're all caught up)", () => {
    const stats = campaignStats(edition, slots, [], NOW);
    expect(attentionItems(edition, stats, [], NOW)).toEqual([]);
  });

  test("flags artwork to review, missing cards, bookings to investigate and a close deadline, each with a link", () => {
    const bookings = [
      booking({ slotIds: ["s1"] }), // artwork awaiting review
      booking({ slotIds: ["s2"], stripePaymentMethodId: null, artwork: null }), // no card
      booking({ slotIds: ["s3"], status: "released", claims: [{ slotId: "s3", released: true }], stripeSetupStatus: "succeeded" }), // card saved after hold expired
    ];
    const soon = Date.parse("2026-12-12T12:00:00Z");
    const items = attentionItems(edition, campaignStats(edition, slots, bookings, soon), bookings, soon);
    expect(items.map((i) => [i.key, i.href])).toEqual([
      ["artwork", "/admin/artwork"],
      ["payment-missing", "/admin/payments"],
      ["investigate", "/admin/advertisers"],
      ["deadline", "/admin/campaigns/e1"],
    ]);
  });
});

describe("recent activity", () => {
  test("lists only real stored events, newest first", () => {
    const confirmed = booking({ slotIds: ["s1"], confirmedAt: "2026-11-30T10:10:00Z" });
    const failed = booking({ slotIds: ["s2"], status: "pending", confirmedAt: null, stripeSetupStatus: "failed", stripeSetupStatusAt: "2026-11-30T11:00:00Z" });
    const events = recentActivity([confirmed, failed], [{ bookingId: confirmed.id, sentAt: "2026-11-30T10:11:00Z" }]);
    expect(events.map((e) => e.title)).toEqual(["Card setup failed", "Confirmation email sent", "Reservation confirmed"]);
    expect(recentActivity([], [])).toEqual([]);
  });
});

describe("blocked spaces and fullness", () => {
  test("blocked spaces are neither sold nor sellable; full = every sellable unit reserved", () => {
    const blocked = slots.map((s) => (s.label === "F8" ? { ...s, blockedAt: "2026-11-01T00:00:00Z", blockedReason: "test" } : s));
    const all = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((id) => booking({ slotIds: [id] }));
    const stats = campaignStats(edition, blocked, all, NOW);
    expect(stats).toMatchObject({ totalUnits: 8, blockedUnits: 1, sellableUnits: 7, reservedUnits: 7, availableUnits: 0, fullyReserved: true, filledPercent: 100 });
    expect(slotStates(edition, blocked, all, NOW).get("s8")?.state).toBe("blocked");
    const notFull = campaignStats(edition, slots, all, NOW); // without the block, one space is still open
    expect(notFull.fullyReserved).toBe(false);
  });

  test("a paused campaign has no available spaces", () => {
    expect(campaignStats({ ...edition, pausedAt: "2026-11-30T00:00:00Z" }, slots, [], NOW).availableUnits).toBe(0);
  });
});

describe("artwork review state", () => {
  test("only unreviewed, positioned artwork on confirmed reservations awaits review", () => {
    expect(artworkAwaitingReview(booking({ slotIds: ["s1"] }))).toBe(true);
    for (const review of ["approved", "rejected", "changes_requested"] as const) {
      expect(artworkAwaitingReview(booking({ slotIds: ["s1"], artworkReview: review }))).toBe(false);
    }
  });
});

describe("payment readiness", () => {
  const consent = (b: AdminBooking) => ({ amountCents: b.priceCents });

  test("ready only when confirmed, allocated, consented for the stored amount, card saved, not flagged", () => {
    const b = booking({ slotIds: ["s1", "s2"] });
    expect(paymentReadinessDetail(b, consent(b))).toEqual({ ready: true, blockers: [] });
  });

  test("each failing rule is named", () => {
    const b = booking({ slotIds: ["s1"] });
    expect(paymentReadinessDetail(b, undefined).blockers).toEqual(["No future-charge consent on record"]);
    expect(paymentReadinessDetail(b, { amountCents: 50000 }).blockers).toEqual(["Consent amount differs from the reservation amount"]);
    expect(paymentReadinessDetail({ ...b, stripePaymentMethodId: null, stripeSetupStatus: "failed" }, consent(b)).blockers).toEqual(["Card setup failed"]);
    expect(paymentReadinessDetail({ ...b, claims: [] }, consent(b)).blockers).toEqual(["Its spaces aren't all allocated"]);
    expect(paymentReadinessDetail({ ...b, flag: { at: "x", reason: "y" } }, consent(b)).blockers).toEqual(["Flagged for investigation"]);
    expect(paymentReadinessDetail({ ...b, status: "pending" }, consent(b)).ready).toBe(false);
  });
});

describe("missed reservation deadline (Phase 6A)", () => {
  const past = { ...edition, artworkDeadline: "2026-11-30T00:00:00Z" }; // before NOW
  const half = ["s1", "s2", "s3", "s4"].map((id) => booking({ slotIds: [id] }));

  test("an open or closed campaign past its deadline and not full asks the admin to decide", () => {
    for (const status of ["open", "closed"]) {
      const e = { ...past, status };
      expect(deadlineMissed(e, campaignStats(e, slots, half, NOW), NOW)).toBe(true);
      const item = attentionItems(e, campaignStats(e, slots, half, NOW), half, NOW).find((i) => i.key === "deadline-missed");
      expect(item).toMatchObject({ tone: "danger", href: "/admin/campaigns/e1", title: "Deadline passed: 4 of 8 spaces reserved" });
    }
  });

  test("not flagged before the deadline, when full, or once the campaign moved on", () => {
    const full = slots.map((s) => booking({ slotIds: [s.id] }));
    expect(deadlineMissed(edition, campaignStats(edition, slots, half, NOW), NOW)).toBe(false); // deadline still ahead
    expect(deadlineMissed(past, campaignStats(past, slots, full, NOW), NOW)).toBe(false); // full
    for (const status of ["approved_to_print", "cancelled", "draft"]) {
      const e = { ...past, status };
      expect(deadlineMissed(e, campaignStats(e, slots, half, NOW), NOW)).toBe(false);
    }
  });
});


test("square campaigns still require ten reservations when one position is blocked", () => {
  const squareSlots = Array.from({ length: 10 }, (_, i) => ({ ...slots[0], id: `square${i}`, blockedAt: i === 9 ? "2026-11-01" : null }));
  const bookings = squareSlots.slice(0, 9).map(s => booking({ slotIds: [s.id], priceCents: 39900 }));
  const stats = campaignStats({ ...edition, productModel: "square_v1" }, squareSlots, bookings, NOW);
  expect(stats.filledPercent).toBe(90);
  expect(stats.fullyReserved).toBe(false);
});
