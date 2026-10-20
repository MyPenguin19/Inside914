import { expect, test, vi } from "vitest";
import { SQUARE_TEMPLATE } from "@/lib/admin/layouts";
import { CampaignForm } from "@/lib/admin/campaign-form";
import { FIRST_CAMPAIGN_DEFAULTS } from "@/lib/admin/first-campaign";
import { SQUARE_PRODUCT } from "@/lib/booking/square-product";
vi.mock("server-only", () => ({}));
const { pricesFor } = await import("@/lib/pricing");

test.each(["test", "launch"])("square pricing remains $399 in %s mode", mode => {
  expect(pricesFor({ productModel: SQUARE_PRODUCT.model, unitPriceCents: 39900, doublePriceCents: null }, { NODE_ENV: "test", INSIDE914_PRICING_MODE: mode })).toMatchObject({ unitPriceCents: 39900, doublePriceCents: null, mode });
  expect(() => pricesFor({ productModel: SQUARE_PRODUCT.model, unitPriceCents: 100, doublePriceCents: null }, { NODE_ENV: "test", INSIDE914_PRICING_MODE: mode })).toThrow(/399/);
});
test.each([{ unit_price_cents: "1" }, { unit_price_cents: "500" }, { double_price_cents: "900" }])("new campaign rejects changed terms %j", changes => {
  expect(CampaignForm.safeParse({ ...FIRST_CAMPAIGN_DEFAULTS, zone_id: "00000000-0000-4000-8000-000000000001", ...changes }).success).toBe(false);
});
test("only ten paid squares are copied into inventory, in trim coordinates", () => {
  expect(SQUARE_TEMPLATE.approved).toBe(true);
  expect(SQUARE_TEMPLATE.slots).toHaveLength(10);
  expect(SQUARE_TEMPLATE.slots.filter(s => s.side === "front")).toHaveLength(6);
  expect(SQUARE_TEMPLATE.slots.filter(s => s.side === "back")).toHaveLength(4);
  for (const s of SQUARE_TEMPLATE.slots) {
    expect(s.width).toBe(2.5); expect(s.height).toBe(2.5);
    expect(s.x + s.width).toBeLessThanOrEqual(9); expect(s.y + s.height).toBeLessThanOrEqual(6);
    if (s.side === "back") expect(s.x + s.width).toBeLessThan(5.1375);
  }
});
