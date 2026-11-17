import { SQUARE_PRODUCT } from "@/lib/booking/square-product";

// Owner-proposed values only. Loading this preset never writes database records.
export const FIRST_ZONE = { name: "Central Westchester", slug: "central-westchester", household_count: 5000 } as const;
export const FIRST_CAMPAIGN_DEFAULTS = {
  name: "Central Westchester — January 2027",
  issue_month: "2027-01",
  target_quantity: "5000",
  reservations_open_at: "",
  reservation_deadline: "2026-12-15T23:59",
  artwork_due_at: "2026-12-20T23:59",
  mailing_window_start: "2027-01-11",
  mailing_window_end: "2027-01-15",
  layout_template: SQUARE_PRODUCT.layoutKey,
  unit_price_cents: String(SQUARE_PRODUCT.priceCents / 100),
  back_unit_price_cents: String(SQUARE_PRODUCT.backPriceCents / 100),
  double_price_cents: "",
} as const;
