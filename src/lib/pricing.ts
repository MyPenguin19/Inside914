import "server-only";

// THE place that decides what a space costs. Amounts are integer cents, computed on the server.
//
// INSIDE914_PRICING_MODE must be set explicitly (no default, so nothing ever falls back to launch
// prices silently):
//   test   -> TEMPORARY development prices below. Refused unless the Stripe keys are TEST keys.
//   launch -> each edition's own prices from the database (intended: $500 / $900).
// hold_slots() re-checks this in the database: 'launch' must equal the edition's prices and
// 'test' must be lower than them. Every booking stores its price and pricing_mode.

export type PricingMode = "test" | "launch";
export type Prices = { unitPriceCents: number; doublePriceCents: number | null };

export const TEST_PRICES = { unitPriceCents: 100, doublePriceCents: 200 } as const; // $1 / $2, temporary
export const LAUNCH_PRICES = { unitPriceCents: 50000, doublePriceCents: 90000 } as const; // reference; editions are authoritative

export class PricingConfigError extends Error {
  constructor(message: string) {
    super(`Pricing configuration: ${message}`);
    this.name = "PricingConfigError";
  }
}

const isTestSecret = (key: string) => key.startsWith("sk_test_") || key.startsWith("rk_test_");

export function getPricingMode(env: NodeJS.ProcessEnv = process.env): PricingMode {
  const mode = env.INSIDE914_PRICING_MODE;
  if (mode !== "test" && mode !== "launch") {
    throw new PricingConfigError("INSIDE914_PRICING_MODE must be set to 'test' or 'launch'");
  }
  if (mode === "test") {
    // Test prices and Stripe test mode go together: never with live keys.
    const secret = env.STRIPE_SECRET_KEY;
    const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (secret && !isTestSecret(secret)) throw new PricingConfigError("test pricing requires a Stripe TEST secret key");
    if (publishable && !publishable.startsWith("pk_test_")) {
      throw new PricingConfigError("test pricing requires a Stripe TEST publishable key");
    }
  }
  return mode;
}

// What an edition costs under the active configuration. A double stays unavailable if the
// edition doesn't offer one.
export function pricesFor(edition: Prices, env: NodeJS.ProcessEnv = process.env): Prices & { mode: PricingMode } {
  const mode = getPricingMode(env);
  if (mode === "launch") return { mode, ...edition };
  return {
    mode,
    unitPriceCents: TEST_PRICES.unitPriceCents,
    doublePriceCents: edition.doublePriceCents === null ? null : TEST_PRICES.doublePriceCents,
  };
}
