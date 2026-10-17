import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createHoldToken, hashHoldToken } = await import("@/lib/booking/hold-token");
const { placeHold } = await import("@/lib/booking/place-hold");

const SLOT_ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";

// Minimal stand-in for the edition price lookup and supabase.rpc(...).single().
const EDITION = { unit_price_cents: 50000, double_unit_price_cents: 90000 };
function fakeAdmin(result: { data?: unknown; error?: { code: string; message: string } | null }, edition: object | null = EDITION) {
  const rpc = vi.fn(() => ({ single: async () => ({ data: result.data ?? null, error: result.error ?? null }) }));
  const lookup = { select: () => lookup, eq: () => lookup, maybeSingle: async () => ({ data: edition && { editions: edition }, error: null }) };
  return { client: { rpc, from: () => lookup } as never, rpc };
}

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv("INSIDE914_PRICING_MODE", "test"));

describe("hold token", () => {
  test("is 256-bit base64url and unique per call", () => {
    const a = createHoldToken();
    const b = createHoldToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
  });

  test("stores only a 64-char hex SHA-256 of the token", () => {
    const { token, hash } = createHoldToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashHoldToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});

describe("placeHold", () => {
  test("rejects bad slot ids or more than two slots without calling the database", async () => {
    const { client, rpc } = fakeAdmin({});
    expect(await placeHold(client, { slotIds: ["not-a-uuid"] })).toEqual({ ok: false, reason: "invalid_input" });
    expect(await placeHold(client, { slotIds: [] })).toEqual({ ok: false, reason: "invalid_input" });
    expect(await placeHold(client, { slotIds: [SLOT_ID, SLOT_ID, SLOT_ID] })).toEqual({ ok: false, reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("sends the token hash, never the token, and returns the token to the caller", async () => {
    const { client, rpc } = fakeAdmin({
      data: { booking_id: "b1", hold_expires_at: "2026-10-16T05:15:00Z", size: "standard", price_cents: 100 },
    });
    const result = await placeHold(client, { slotIds: [SLOT_ID] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const args = rpc.mock.calls[0] as unknown as [string, Record<string, unknown> & { p_token_hash: string }];
    expect(args[0]).toBe("hold_slots");
    expect(args[1].p_slot_ids).toEqual([SLOT_ID]);
    expect(args[1].p_token_hash).toBe(hashHoldToken(result.token));
    expect(result).toMatchObject({ bookingId: "b1", expiresAt: "2026-10-16T05:15:00Z", size: "standard", priceCents: 100 });
  });

  test("sends the server's test prices ($1 / $2) with mode 'test', never a browser value", async () => {
    const { client, rpc } = fakeAdmin({ data: { booking_id: "b1", hold_expires_at: "x", size: "standard", price_cents: 100 } });
    await placeHold(client, { slotIds: [SLOT_ID], priceCents: 1, unitPriceCents: 1 }); // extra fields are ignored
    expect(rpc.mock.calls[0]).toEqual([
      "hold_slots",
      expect.objectContaining({ p_pricing_mode: "test", p_unit_price_cents: 100, p_double_price_cents: 200 }),
    ]);
  });

  test("launch mode sends the edition's own prices", async () => {
    vi.stubEnv("INSIDE914_PRICING_MODE", "launch");
    const { client, rpc } = fakeAdmin({ data: { booking_id: "b1", hold_expires_at: "x", size: "standard", price_cents: 50000 } });
    await placeHold(client, { slotIds: [SLOT_ID] });
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_pricing_mode: "launch", p_unit_price_cents: 50000, p_double_price_cents: 90000 });
  });

  test("no pricing mode configured: nothing is held", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("INSIDE914_PRICING_MODE", "");
    const unset = fakeAdmin({});
    expect(await placeHold(unset.client, { slotIds: [SLOT_ID] })).toEqual({ ok: false, reason: "error" });
    expect(unset.rpc).not.toHaveBeenCalled();
  });

  test("with live Stripe keys, test pricing still holds at $1 (owner's decision)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_example");
    const { client, rpc } = fakeAdmin({ data: { booking_id: "b1", hold_expires_at: "x", size: "standard", price_cents: 100 } });
    expect((await placeHold(client, { slotIds: [SLOT_ID] })).ok).toBe(true);
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_pricing_mode: "test", p_unit_price_cents: 100 });
  });

  test("an unknown slot is reported without placing a hold", async () => {
    const { client, rpc } = fakeAdmin({}, null);
    expect(await placeHold(client, { slotIds: [SLOT_ID] })).toEqual({ ok: false, reason: "slot_not_found" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ["INS01", "slot_not_found"],
    ["INS02", "edition_closed"],
    ["INS03", "slot_unavailable"],
    ["INS04", "invalid_selection"],
    ["INS05", "invalid_pricing"],
    ["XX000", "error"],
  ])("maps database error %s to %s", async (code, reason) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeAdmin({ error: { code, message: "boom" } });
    expect(await placeHold(client, { slotIds: [SLOT_ID] })).toEqual({ ok: false, reason });
  });
});
