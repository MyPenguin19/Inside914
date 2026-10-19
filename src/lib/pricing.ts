import "server-only";
import { SQUARE_PRODUCT } from "@/lib/booking/square-product";

// THE place that decides what a space costs. Amounts are integer cents, computed on the server.
//
// New square_v1 campaigns always cost $399 in both modes, with no alternate sizes.
// The temporary $1/$2 rules below apply only to historical legacy campaigns.
// INSIDE914_PRICING_MODE must be set explicitly (no default, so nothing ever falls back to launch
// prices silently):
//   test   -> TEMPORARY prices below ($1 / $2). Requires isolated infrastructure and test Stripe keys; cards are only saved, never charged at reservation.
//   launch -> each edition's own prices from the database (intended: $500 / $900).
// hold_slots() re-checks this in the database: 'launch' must equal the edition's prices and
// 'test' must be lower than them. Every booking stores its price and pricing_mode.

export type PricingMode = "test" | "launch";
export type Prices = { productModel?: string; unitPriceCents: number; doublePriceCents: number | null };

export const TEST_PRICES = { unitPriceCents: 100, doublePriceCents: 200 } as const; // $1 / $2, temporary
export const LAUNCH_PRICES = { unitPriceCents: 50000, doublePriceCents: 90000 } as const; // reference; editions are authoritative

// Full-side products retain these amounts even in isolated test mode (cards are only saved).
export const POSTCARD_PRICES = { fullSidePriceCents: 160000, bothSidesPriceCents: 290000 } as const;

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
  if (mode === "test" && (
    env.VERCEL_ENV === "production" ||
    env.NEXT_PUBLIC_SUPABASE_URL?.includes("hsexthbomretpmqolkqw") ||
    /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "") ||
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")
  )) {
    throw new PricingConfigError("test pricing is forbidden with production infrastructure or live Stripe keys");
  }
  return mode;
}

// What an edition costs under the active configuration. A double stays unavailable if the
// edition doesn't offer one.
export function pricesFor(edition: Prices, env: NodeJS.ProcessEnv = process.env): Prices & { mode: PricingMode } {
  const mode = getPricingMode(env);
  if (edition.productModel === SQUARE_PRODUCT.model) {
    if (edition.unitPriceCents !== SQUARE_PRODUCT.priceCents || edition.doublePriceCents !== null) {
      throw new PricingConfigError("square campaigns require one $399 product");
    }
    return { mode, ...edition };
  }
  if (mode === "launch") return { mode, ...edition };
  return {
    mode,
    unitPriceCents: TEST_PRICES.unitPriceCents,
    doublePriceCents: edition.doublePriceCents === null ? null : TEST_PRICES.doublePriceCents,
  };
}
