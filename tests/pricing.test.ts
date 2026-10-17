import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getPricingMode, pricesFor, TEST_PRICES } = await import("@/lib/pricing");

const edition = { unitPriceCents: 50000, doublePriceCents: 90000 };
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("pricing configuration", () => {
  test("test mode: $1 standard, $2 double, in integer cents", () => {
    expect(pricesFor(edition, env({ INSIDE914_PRICING_MODE: "test" }))).toEqual({ mode: "test", unitPriceCents: 100, doublePriceCents: 200 });
    expect(Number.isInteger(TEST_PRICES.unitPriceCents) && Number.isInteger(TEST_PRICES.doublePriceCents)).toBe(true);
  });

  test("launch mode: the edition's own prices", () => {
    expect(pricesFor(edition, env({ INSIDE914_PRICING_MODE: "launch" }))).toEqual({ mode: "launch", ...edition });
  });

  test("a double stays unavailable when the edition doesn't offer one, in either mode", () => {
    expect(pricesFor({ unitPriceCents: 50000, doublePriceCents: null }, env({ INSIDE914_PRICING_MODE: "test" })).doublePriceCents).toBeNull();
  });

  test("never falls back silently: an unset or unknown mode is a configuration error", () => {
    for (const mode of [undefined, "", "TEST", "live", "free"]) {
      expect(() => getPricingMode(env(mode === undefined ? {} : { INSIDE914_PRICING_MODE: mode }))).toThrow(/INSIDE914_PRICING_MODE/);
    }
  });

  test("test pricing is refused with live Stripe keys", () => {
    expect(() => getPricingMode(env({ INSIDE914_PRICING_MODE: "test", STRIPE_SECRET_KEY: "sk_live_x" }))).toThrow(/TEST secret key/);
    expect(() => getPricingMode(env({ INSIDE914_PRICING_MODE: "test", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x" }))).toThrow(/TEST publishable/);
    expect(getPricingMode(env({ INSIDE914_PRICING_MODE: "test", STRIPE_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x" }))).toBe("test");
  });
});
