import { describe, expect, test, vi } from "vitest";
import { CampaignForm } from "@/lib/admin/campaign-form";
import { FIRST_CAMPAIGN_DEFAULTS } from "@/lib/admin/first-campaign";
import { LAYOUT_TEMPLATES } from "@/lib/admin/layouts";
import { zoneSchema } from "@/lib/admin/zone-form";
vi.mock("server-only", () => ({}));
const { pricesFor, getPricingMode } = await import("@/lib/pricing");
const draft = { ...FIRST_CAMPAIGN_DEFAULTS, zone_id: "00000000-0000-4000-8000-000000000001" };

describe("first campaign proposal", () => {
  test("stores Eastern deadlines as UTC and launch prices as cents", () => {
    const result = CampaignForm.parse(draft);
    expect(result).toMatchObject({ issue_month: "2027-01-01", target_quantity: 5000, reservations_open_at: null, reservation_deadline: "2026-12-16T04:59:00.000Z", artwork_due_at: "2026-12-21T04:59:00.000Z", mailing_window_start: "2027-01-11", mailing_window_end: "2027-01-15", unit_price_cents: 39900, double_price_cents: null });
    expect(pricesFor({ unitPriceCents: result.unit_price_cents, doublePriceCents: result.double_price_cents }, { NODE_ENV: "test", INSIDE914_PRICING_MODE: "launch" })).toEqual({ mode: "launch", unitPriceCents: 39900, doublePriceCents: null });
  });
  test.each([{ artwork_due_at: "2026-12-14T23:59" }, { mailing_window_end: "2027-01-10" }, { reservations_open_at: "2026-12-16T00:00" }, { double_price_cents: "400" }])("rejects invalid dates or prices %j", (changes) => {
    expect(CampaignForm.safeParse({ ...draft, ...changes }).success).toBe(false);
  });
  test("test pricing and missing pricing mode fail closed in production", () => {
    expect(() => getPricingMode({ NODE_ENV: "production", VERCEL_ENV: "production", INSIDE914_PRICING_MODE: "test" })).toThrow(/forbidden/);
    expect(() => getPricingMode({ NODE_ENV: "production", VERCEL_ENV: "production" })).toThrow(/must be set/);
  });
  test("legacy sixteen-position template stays unapproved", () => {
    expect(LAYOUT_TEMPLATES[0].approved).toBe(false);
    expect(LAYOUT_TEMPLATES.filter(t => t.approved).map(t => t.key)).toEqual(["amazingmail-9x6-ten-square-draft"]);
    for (const side of ["front", "back"]) {
      const slots = LAYOUT_TEMPLATES[0].slots.filter((s) => s.side === side);
      expect(slots).toHaveLength(8);
      expect(slots.reduce((a, s) => a + s.width * s.height, 0)).toBe(6.5 * 12);
    }
  });
  test("normalizes zone input and rejects invented malformed identifiers/quantities", () => {
    expect(zoneSchema.parse({ id: "", name: " Central Westchester ", slug: "CENTRAL-WESTCHESTER", household_count: "5000" })).toEqual({ id: null, name: "Central Westchester", slug: "central-westchester", household_count: 5000 });
    expect(zoneSchema.safeParse({ id: "", name: " ", slug: "bad slug", household_count: "-1" }).success).toBe(false);
  });
});
