import { POSTCARD_LAYOUT_V2 } from "@/lib/print/layouts";

// New campaign terms; historical products remain readable under their original model.
export const SQUARE_PRODUCT = {
  model: "square_v1",
  priceCents: 39900,
  paidPositions: 10,
  layoutKey: POSTCARD_LAYOUT_V2.key,
  trim: { width: 9, height: 6 },
} as const;
