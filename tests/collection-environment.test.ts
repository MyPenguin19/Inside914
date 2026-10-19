import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertCollectionEnvironment, collectionMode, validateCollectionCredentials, LIVE_COLLECTION_RELEASED } from "@/lib/payments/environment";
import { getCollectionStripe } from "@/lib/payments/charge";

const live = {
  INSIDE914_COLLECTION_MODE: "live", STRIPE_SECRET_KEY: "rk_live_fixture",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_fixture",
  INSIDE914_PRICING_MODE: "launch", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  APP_URL: "https://inside914.example", INSIDE914_DEV_TEST_RESERVATIONS: "false",
  INSIDE914_TEST_COLLECTION: "false",
};
afterEach(() => vi.unstubAllEnvs());

test("collection defaults to off even when live credentials are present", () => {
  expect(collectionMode({ STRIPE_SECRET_KEY: live.STRIPE_SECRET_KEY })).toBe("disabled");
  expect(() => assertCollectionEnvironment({ ...live, INSIDE914_COLLECTION_MODE: undefined })).toThrow("disabled");
  expect(() => assertCollectionEnvironment({ ...live, INSIDE914_COLLECTION_MODE: "disabled" })).toThrow("disabled");
});
test("legacy test flag alone cannot enable collection", () => {
  expect(() => assertCollectionEnvironment({ INSIDE914_TEST_COLLECTION: "true" })).toThrow("disabled");
});
test.each(["LIVE", "true", "", "production"])("unknown mode %s fails closed", mode => {
  expect(() => assertCollectionEnvironment({ ...live, INSIDE914_COLLECTION_MODE: mode })).toThrow("Invalid");
});
test("valid future live settings pass pure validation but cannot construct a Stripe client", () => {
  expect(() => validateCollectionCredentials("live", live)).not.toThrow();
  expect(LIVE_COLLECTION_RELEASED).toBe(false);
  for (const [key, value] of Object.entries(live)) vi.stubEnv(key, value);
  expect(() => getCollectionStripe()).toThrow("not released");
});
test.each([
  { STRIPE_SECRET_KEY: "sk_test_fixture" },
  { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_fixture" },
  { STRIPE_SECRET_KEY: "" },
  { INSIDE914_PRICING_MODE: "test" },
  { INSIDE914_DEV_TEST_RESERVATIONS: "true" },
  { INSIDE914_TEST_COLLECTION: "true" },
  { STRIPE_WEBHOOK_SECRET: "" },
  { APP_URL: "http://inside914.example" },
  { APP_URL: "https://localhost" },
  { APP_URL: "https://user:password@inside914.example" },
])("future live configuration rejects unsafe combination %j", override => {
  expect(() => validateCollectionCredentials("live", { ...live, ...override })).toThrow();
});
test("test collection refuses a matching live key pair", () => {
  expect(() => assertCollectionEnvironment({ ...live, INSIDE914_COLLECTION_MODE: "test", INSIDE914_TEST_COLLECTION: "true", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toThrow("test keys");
});
