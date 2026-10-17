import "server-only";

// THE place that decides what a space costs. Amounts are integer cents, computed on the server.
//
// INSIDE914_PRICING_MODE must be set explicitly (no default, so nothing ever falls back to launch
// prices silently):
//   test   -> TEMPORARY prices below ($1 / $2). Works with test or live Stripe keys (owner's decision,
//             2026-10-17); cards are only saved, never charged at reservation.
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

export function getPricingMode(env: NodeJS.ProcessEnv = process.env): PricingMode {
  const mode = env.INSIDE914_PRICING_MODE;
  if (mode !== "test" && mode !== "launch") {
    throw new PricingConfigError("INSIDE914_PRICING_MODE must be set to 'test' or 'launch'");
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
