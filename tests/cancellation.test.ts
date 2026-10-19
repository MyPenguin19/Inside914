import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { reservationCancelledEmail } = await import("@/lib/email/reservation-cancelled");
const { removeSavedCard } = await import("@/lib/checkout/card-removal");

describe("cancellation email", () => {
  const base = {
    businessName: "Pat's <Bakery>",
    contactName: "Pat",
    reference: "IN914-ABC234",
    zoneName: "Central Westchester",
    issueMonth: "2027-01-01",
    positions: ["F4"],
    side: "front" as const,
    supportEmail: "support@inside914.com",
    card: "removed" as const,
  };

  test("says it's canceled, nothing was charged and the card was removed; escapes customer text", () => {
    const email = reservationCancelledEmail(base);
    expect(email.subject).toBe("Your Inside914 reservation was canceled (IN914-ABC234)");
    for (const body of [email.text, email.html]) {
      expect(body).toMatch(/canceled/i);
      expect(body).toMatch(/not been charged/i);
      expect(body).toMatch(/saved card has been removed/i);
      expect(body).toContain("support@inside914.com");
    }
    expect(email.html).toContain("Pat&#39;s &lt;Bakery&gt;");
    expect(email.html).not.toContain("<Bakery>");
  });

  test("only says the card was removed once Stripe confirmed it (removal pending or failed: says it can't be charged)", () => {
    const pending = reservationCancelledEmail({ ...base, card: "pending" });
    for (const body of [pending.text, pending.html]) {
      expect(body).not.toMatch(/has been removed/i);
      expect(body).toMatch(/can no longer be charged/i);
      expect(body).toMatch(/being removed/i);
      expect(body).not.toMatch(/fail|error|retry|stripe/i); // no internal details
    }
    const none = reservationCancelledEmail({ ...base, card: "none" });
    for (const body of [none.text, none.html]) {
      expect(body).toMatch(/not been charged/i);
      expect(body).not.toMatch(/saved card/i);
    }
  });

  test("never includes the internal cancellation reason or a reservation link", () => {
    const email = reservationCancelledEmail(base);
    expect(email.text).not.toMatch(/reason|http/i);
  });

  test("a campaign that didn't fill says so", () => {
    const email = reservationCancelledEmail({ ...base, notFull: true });
    expect(email.subject).toBe("Your Inside914 campaign didn't fill, so your reservation was canceled (IN914-ABC234)");
    for (const body of [email.text, email.html]) {
      expect(body).toMatch(/fully reserved by its deadline/i);
      expect(body).toMatch(/not been charged/i);
    }
  });

  test("shared cards remain available for other reservations", () => {
    const email = reservationCancelledEmail({ ...base, card: "shared" });
    expect(email.text).toContain("other active reservations");
    expect(email.text).not.toContain("being removed");
  });

  test("test reservations are labeled", () => {
    expect(reservationCancelledEmail({ ...base, test: true }).subject).toMatch(/^\[TEST\] /);
  });
});

// Minimal fake of the Supabase query builder for the bookings table.
function fakeAdmin(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    not: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
    update: (values: Record<string, unknown>) => {
      updates.push(values);
      return chain;
    },
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  };
  return { admin: { from: () => chain } as never, updates };
}

const cancelled = { id: "b1", status: "cancelled", stripe_payment_method_id: "pm_live123", card_removed_at: null };
const stripeWith = (detach: () => Promise<unknown>) => ({ paymentMethods: { detach: vi.fn(detach) } }) as never;

describe("removing the saved card after a cancellation", () => {
  test("detaches the card in Stripe and records it", async () => {
    const { admin, updates } = fakeAdmin(cancelled);
    const stripe = stripeWith(async () => ({}));
    expect(await removeSavedCard(admin, stripe, "b1")).toBe("removed");
    expect((stripe as { paymentMethods: { detach: ReturnType<typeof vi.fn> } }).paymentMethods.detach).toHaveBeenCalledWith("pm_live123");
    expect(updates).toEqual([{ card_removed_at: expect.any(String) }]);
  });

  test.each([
    ["not cancelled", { ...cancelled, status: "reserved" }],
    ["no card saved", { ...cancelled, stripe_payment_method_id: null }],
    ["already removed", { ...cancelled, card_removed_at: "2026-10-18T00:00:00Z" }],
    ["unknown booking", null],
  ])("does nothing when %s", async (_, row) => {
    const { admin, updates } = fakeAdmin(row);
    const stripe = stripeWith(async () => ({}));
    expect(await removeSavedCard(admin, stripe, "b1")).toBe("skipped");
    expect(updates).toEqual([]);
  });

  test("a card Stripe no longer has counts as removed", async () => {
    const { admin, updates } = fakeAdmin(cancelled);
    const gone = Object.assign(new Error("No such PaymentMethod"), { code: "resource_missing" });
    expect(await removeSavedCard(admin, stripeWith(async () => Promise.reject(gone)), "b1")).toBe("removed");
    expect(updates).toHaveLength(1);
  });

  test("any other Stripe failure leaves it for the retry job", async () => {
    const { admin, updates } = fakeAdmin(cancelled);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = Object.assign(new Error("api down"), { code: "api_error" });
    expect(await removeSavedCard(admin, stripeWith(async () => Promise.reject(down)), "b1")).toBe("failed");
    expect(updates).toEqual([]);
  });

  test("a development TEST card is only recorded, never sent to real Stripe", async () => {
    const { admin, updates } = fakeAdmin({ ...cancelled, stripe_payment_method_id: "pm_devtest_1" });
    const stripe = stripeWith(async () => ({}));
    expect(await removeSavedCard(admin, stripe, "b1")).toBe("removed");
    expect((stripe as { paymentMethods: { detach: ReturnType<typeof vi.fn> } }).paymentMethods.detach).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
  });
});
