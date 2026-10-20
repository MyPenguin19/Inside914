import { beforeEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
const { catalog, create } = vi.hoisted(() => ({ catalog: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/catalog/queries", () => ({ getEditionCatalog: catalog, getBookableEditions: vi.fn() }));
vi.mock("@/lib/booking/cart", () => ({ createCart: create, ownedCart: vi.fn() }));
vi.mock("@/lib/artwork/service", () => ({ ARTWORK_BUCKET: "artwork" }));
import { createCategoryCart } from "@/lib/booking/category-checkout";
const admin = {} as SupabaseClient<Database>;
const editionId = randomUUID(), slotId = randomUUID();
beforeEach(() => { vi.clearAllMocks(); catalog.mockResolvedValue({ id: editionId, bookable: true, productModel: "square_v1", zoneSlug: "central-westchester", slots: [{ id: slotId, available: true }] }); });
test("server forwards the selected square only, with no browser price or product choice", async () => {
  await createCategoryCart(admin, { selections: [{ editionId, slotId, price: 1, mode: "both_sides" }], categoryId: "plumbing" });
  expect(create).toHaveBeenCalledWith(admin, [{ editionId, slotIds: [slotId], mode: "standard" }]);
});
test("foreign or unavailable squares cannot be substituted", async () => {
  await expect(createCategoryCart(admin, { selections: [{ editionId, slotId: randomUUID() }] })).rejects.toThrow("nothing was held");
  expect(create).not.toHaveBeenCalled();
});
test("closed campaigns and duplicate areas are rejected before a hold", async () => {
  catalog.mockResolvedValueOnce({ bookable: false });
  await expect(createCategoryCart(admin, { selections: [{ editionId, slotId }] })).rejects.toThrow("available campaign");
  await expect(createCategoryCart(admin, { selections: [{ editionId, slotId }, { editionId: randomUUID(), slotId }] })).rejects.toThrow("per area");
  expect(create).not.toHaveBeenCalled();
});
