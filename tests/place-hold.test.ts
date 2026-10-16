import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createHoldToken, hashHoldToken } = await import("@/lib/booking/hold-token");
const { placeHold } = await import("@/lib/booking/place-hold");

const SLOT_ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";

// Minimal stand-in for supabase.rpc(...).single().
function fakeAdmin(result: { data?: unknown; error?: { code: string; message: string } | null }) {
  const rpc = vi.fn(() => ({ single: async () => ({ data: result.data ?? null, error: result.error ?? null }) }));
  return { client: { rpc } as never, rpc };
}

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
  test("rejects a non-UUID slot id without calling the database", async () => {
    const { client, rpc } = fakeAdmin({});
    expect(await placeHold(client, { slotId: "not-a-uuid" })).toEqual({ ok: false, reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("sends the token hash, never the token, and returns the token to the caller", async () => {
    const { client, rpc } = fakeAdmin({
      data: { reservation_id: "r1", hold_expires_at: "2026-10-16T05:15:00Z" },
    });
    const result = await placeHold(client, { slotId: SLOT_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const args = rpc.mock.calls[0] as unknown as [string, { p_slot_id: string; p_token_hash: string }];
    expect(args[0]).toBe("hold_slot");
    expect(args[1].p_slot_id).toBe(SLOT_ID);
    expect(args[1].p_token_hash).toBe(hashHoldToken(result.token));
    expect(result).toMatchObject({ reservationId: "r1", expiresAt: "2026-10-16T05:15:00Z" });
  });

  test.each([
    ["INS01", "slot_not_found"],
    ["INS02", "edition_closed"],
    ["INS03", "slot_unavailable"],
    ["XX000", "error"],
  ])("maps database error %s to %s", async (code, reason) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeAdmin({ error: { code, message: "boom" } });
    expect(await placeHold(client, { slotId: SLOT_ID })).toEqual({ ok: false, reason });
  });
});
