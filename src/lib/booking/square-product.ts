import { POSTCARD_LAYOUT_V2 } from "@/lib/print/layouts";

// Defaults only. Each campaign is authoritative for new holds; bookings retain their agreed price.
export const SQUARE_PRODUCT = {
  model: "square_v1",
  priceCents: 39900,
  backPriceCents: 34900,
  paidPositions: 10,
  layoutKey: POSTCARD_LAYOUT_V2.key,
  trim: { width: 9, height: 6 },
} as const;
