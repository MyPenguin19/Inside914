import { afterEach, describe, expect, test, vi } from "vitest";
import { devTestMode, isTestStripeId } from "@/lib/dev/test-mode";

vi.mock("server-only", () => ({}));
const { fakeStripe, isFakeStripe } = await import("@/lib/dev/fake-stripe");
const { getStripe } = await import("@/lib/checkout/stripe");
const { stripeModeConflict } = await import("@/lib/checkout/service");

const DEV = {
  INSIDE914_DEV_TEST_RESERVATIONS: "true",
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://uobiwanrxifqwdnouzxj.supabase.co",
};

describe("development TEST reservation guard (fails closed)", () => {
  test("on only for a dev build, off Vercel, against the dev or local database", () => {
    expect(devTestMode(DEV)).toEqual({ active: true, reason: "ok" });
    expect(devTestMode({ ...DEV, NODE_ENV: "test" }).active).toBe(true);
    expect(devTestMode({ ...DEV, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).active).toBe(true);
  });

  test.each([
    ["flag missing", { ...DEV, INSIDE914_DEV_TEST_RESERVATIONS: undefined }, "flag_off"],
    ["flag not exactly true", { ...DEV, INSIDE914_DEV_TEST_RESERVATIONS: "1" }, "flag_off"],
    ["production build", { ...DEV, NODE_ENV: "production" }, "not_development_build"],
    ["no NODE_ENV", { ...DEV, NODE_ENV: undefined }, "not_development_build"],
    ["Vercel production", { ...DEV, VERCEL: "1", VERCEL_ENV: "production" }, "running_on_vercel"],
    ["Vercel preview", { ...DEV, VERCEL_ENV: "preview" }, "running_on_vercel"],
    ["any Vercel URL", { ...DEV, VERCEL_URL: "inside914.vercel.app" }, "running_on_vercel"],
    ["another Supabase project", { ...DEV, NEXT_PUBLIC_SUPABASE_URL: "https://prodprojectref.supabase.co" }, "not_dev_database"],
    ["lookalike host", { ...DEV, NEXT_PUBLIC_SUPABASE_URL: "https://uobiwanrxifqwdnouzxj.supabase.co.evil.com" }, "not_dev_database"],
    ["missing database", { ...DEV, NEXT_PUBLIC_SUPABASE_URL: undefined }, "unknown_database"],
  ])("stays OFF: %s", (_, env, reason) => {
    expect(devTestMode(env)).toEqual({ active: false, reason });
  });
});

describe("the fake Stripe client", () => {
  test("has no way to charge: only customers, setup intents and payment-method detach", () => {
    expect(Object.keys(fakeStripe).sort()).toEqual(["customers", "isDevTestFake", "paymentMethods", "setupIntents", "simulateSuccess"]);
    for (const forbidden of ["paymentIntents", "charges", "subscriptions", "invoices", "checkout"]) {
      expect(fakeStripe).not.toHaveProperty(forbidden);
    }
  });

  test("issues clearly fake devtest ids", async () => {
    const customer = await fakeStripe.customers.create();
    const intent = await fakeStripe.setupIntents.create({ customer: customer.id });
    expect(isTestStripeId(customer.id)).toBe(true);
    expect(isTestStripeId(intent.id)).toBe(true);
    expect(fakeStripe.simulateSuccess(intent.id)).toBe(true);
    const done = await fakeStripe.setupIntents.retrieve(intent.id);
    expect(done.status).toBe("succeeded");
    expect(isTestStripeId(done.payment_method)).toBe(true);
    expect(isTestStripeId("cus_RealCustomer123")).toBe(false);
  });
});

describe("getStripe picks the fake only when the guard allows", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("dev + flag + dev database: fake", () => {
    for (const [k, v] of Object.entries(DEV)) vi.stubEnv(k, v);
    expect(isFakeStripe(getStripe())).toBe(true);
  });

  test("flag set on a Vercel deployment: the real client (which needs real test keys)", () => {
    for (const [k, v] of Object.entries(DEV)) vi.stubEnv(k, v);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("test and real bookings never mix", () => {
  const booking = (customer: string, setupIntent: string) =>
    ({ stripeCustomerId: customer, stripeSetupIntentId: setupIntent }) as Parameters<typeof stripeModeConflict>[0];
  const realClient = { customers: {}, setupIntents: {}, paymentMethods: {} } as never;

  test("real Stripe refuses a booking that has test ids", () => {
    expect(stripeModeConflict(booking("cus_devtest_abc", "seti_devtest_abc"), realClient)).toBe("test_booking");
  });

  test("the fake refuses a booking that has real ids", () => {
    expect(stripeModeConflict(booking("cus_Real123", "seti_Real123"), fakeStripe as never)).toBe("real_booking");
  });

  test("matching modes are fine", () => {
    expect(stripeModeConflict(booking("cus_devtest_abc", "seti_devtest_abc"), fakeStripe as never)).toBeNull();
    expect(stripeModeConflict(booking("cus_Real123", "seti_Real123"), realClient)).toBeNull();
  });
});
