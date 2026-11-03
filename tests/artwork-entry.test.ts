import { beforeEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
const { create, existing, set, limit } = vi.hoisted(() => ({ create: vi.fn(), existing: vi.fn(), set: vi.fn(), limit: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set }), headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ SUPABASE_SECRET_KEY: "local-fixture" }) }));
vi.mock("@/lib/operations/notify-after", () => ({ notifyOwnerAfterResponse: vi.fn() }));
vi.mock("@/lib/booking/hold-rate-limit", () => ({ allowHoldAttempt: limit, clientAddress: () => "local", visitorHash: () => "fixture" }));
vi.mock("@/lib/booking/cart", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/booking/cart")>(), ownedCart: existing }));
vi.mock("@/lib/booking/category-checkout", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/booking/category-checkout")>(), createCategoryCart: create }));
import { holdAreas } from "@/app/book/cart/actions";
import { CART_COOKIE, cartMemberToken } from "@/lib/booking/cart";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";

beforeEach(() => { vi.clearAllMocks(); limit.mockResolvedValue(true); existing.mockResolvedValue(null); create.mockResolvedValue({ token: "fixture-cart-token", id: randomUUID() }); });

test("a successful hold opens only the first validated area's editor using its own capability", async () => {
  const selections = [0, 1].map(() => ({ editionId: randomUUID(), slotId: randomUUID() }));
  expect(await holdAreas({ selections })).toEqual({ ok: true });
  expect(set).toHaveBeenCalledWith(CART_COOKIE, "fixture-cart-token", expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
  expect(set).toHaveBeenCalledWith(HOLD_COOKIE, cartMemberToken("fixture-cart-token", selections[0].editionId), expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
  expect(set).toHaveBeenCalledTimes(2);
});

test("failed holds cannot install an artwork capability", async () => {
  create.mockRejectedValueOnce(new Error("Position no longer available"));
  expect(await holdAreas({ selections: [{ editionId: randomUUID(), slotId: randomUUID() }] })).toEqual({ ok: false, message: "Position no longer available" });
  expect(set).not.toHaveBeenCalled();
});

test("an existing active cart is preserved rather than replaced by direct artwork navigation", async () => {
  existing.mockResolvedValue({ members: [{ status: "pending", holdExpiresAt: new Date(Date.now() + 60000).toISOString() }] });
  expect((await holdAreas({ selections: [{ editionId: randomUUID(), slotId: randomUUID() }] })).ok).toBe(false);
  expect(create).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
});
