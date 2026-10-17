import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getStripeEnv, getStripeKeyMode } = await import("@/lib/env/checkout");
const { getStripePublishableKey } = await import("@/lib/env/public");
const { TestCheckoutNotice } = await import("@/components/checkout/test-checkout-notice");

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const keys = (secret: string, publishable?: string) => {
  vi.stubEnv("STRIPE_SECRET_KEY", secret);
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", publishable ?? "");
};

describe("Stripe keys", () => {
  test("test and live keys are both accepted, and the mode is read from the secret key", () => {
    keys("sk_test_abc", "pk_test_abc");
    expect(getStripeKeyMode()).toBe("test");
    keys("sk_live_abc", "pk_live_abc");
    expect(getStripeKeyMode()).toBe("live");
    expect(getStripePublishableKey()).toBe("pk_live_abc");
  });

  test("anything that isn't a Stripe secret key is refused", () => {
    for (const bad of ["pk_live_abc", "whsec_abc", "live_abc", "sb_secret_abc"]) {
      keys(bad);
      expect(() => getStripeEnv()).toThrow(/STRIPE_SECRET_KEY/);
    }
  });

  test("a live secret with a test publishable key (or the reverse) is refused", () => {
    keys("sk_live_abc", "pk_test_abc");
    expect(() => getStripeKeyMode()).toThrow(/must be a live key/);
    keys("sk_test_abc", "pk_live_abc");
    expect(() => getStripeKeyMode()).toThrow(/must be a test key/);
  });
});

describe("temporary pricing notice", () => {
  test("live keys: says the real card is saved and never mentions test mode or test cards", () => {
    keys("sk_live_abc", "pk_live_abc");
    render(<TestCheckoutNotice checkout />);
    const note = screen.getByRole("note").textContent!;
    expect(note).toMatch(/\$1 standard, \$2 double/);
    expect(note).toMatch(/nothing is charged today/i);
    expect(note).not.toMatch(/test mode|4242|No real card/i);
  });

  test("test keys: says Stripe is in test mode and offers a test card on checkout pages", () => {
    keys("sk_test_abc", "pk_test_abc");
    render(<TestCheckoutNotice checkout />);
    expect(screen.getByRole("note").textContent).toMatch(/Stripe is in test mode.*4242 4242 4242 4242/);
  });

  test("no Stripe keys: shows the prices without any claim about Stripe", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    render(<TestCheckoutNotice />);
    const note = screen.getByRole("note").textContent!;
    expect(note).toMatch(/\$1 standard, \$2 double/);
    expect(note).not.toMatch(/Stripe|test mode/);
  });
});
