import type { Side } from "./selection";

// Display the server-validated campaign amount for the actual selected side.
export function placementPrice(prices: { unitPriceCents: number; backUnitPriceCents?: number | null; productModel?: string }, side: Side) {
  if (side === "back" && prices.productModel === "square_v1") {
    if (!Number.isInteger(prices.backUnitPriceCents) || prices.backUnitPriceCents! <= 0) throw new Error("Back placement price unavailable");
    return prices.backUnitPriceCents!;
  }
  return prices.unitPriceCents;
}
