import { beforeEach, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
import { ownedCart } from "@/lib/booking/cart";
import { hashHoldToken } from "@/lib/booking/hold-token";

const rows = Array.from({ length: 4 }, (_, i) => ({
  id: `booking-${i}`, cart_id: "owned-cart", edition_id: `edition-${i}`, status: "pending", size: "standard",
  price_cents: i === 2 ? 100 : 39900, pricing_mode: "launch", hold_expires_at: "2098-01-01", hold_extensions: 0,
  stripe_customer_id: null, stripe_setup_intent_id: null, reference: null,
  editions: { product_model: "square_v1", layout_template: "amazingmail-9x6-ten-square-draft" },
  booking_contacts: { business_name: "Local fixture", email: "fixture@example.com" },
  booking_artwork: i === 3 ? null : { status: "ready", crop_x: 0, crop_y: 0, crop_width: 1000,
    crop_height: i === 1 ? 900 : 1000, width_px: 1000, height_px: 1000, zoom: 1 },
}));
const from = vi.fn();
const filters = vi.fn();
let authorized = true;
let bookingError = false;
const admin = { from } as unknown as SupabaseClient<Database>;

beforeEach(() => {
  authorized = true;
  bookingError = false;
  filters.mockReset();
  from.mockReset().mockImplementation((table: string) => {
    const query = {
      select: () => query, order: () => query, returns: () => query,
      eq: (key: string, value: unknown) => { filters(table, key, value); return query; },
      maybeSingle: () => query,
      then: (resolve: (value: unknown) => void) => Promise.resolve({
        data: table === "reservation_carts" ? authorized ? { id: "owned-cart" } : null : rows,
        error: table === "bookings" && bookingError ? { message: "unavailable" } : null,
      }).then(resolve),
    };
    return query;
  });
});

test("owned four-area cart takes two reads and preserves prices, contact and crop readiness", async () => {
  const cart = await ownedCart(admin, "private-cookie-token");
  expect(from.mock.calls.map(([table]) => table)).toEqual(["reservation_carts", "bookings"]);
  expect(filters).toHaveBeenNthCalledWith(1, "reservation_carts", "token_hash", hashHoldToken("private-cookie-token"));
  expect(filters).toHaveBeenNthCalledWith(2, "bookings", "cart_id", "owned-cart");
  expect(cart?.members.map(b => b.id)).toEqual(rows.map(b => b.id));
  expect(cart?.members.map(b => b.priceCents)).toEqual([39900, 39900, 100, 39900]);
  expect(cart?.members.map(b => b.artworkReady)).toEqual([true, false, true, false]);
  expect(cart?.members.every(b => b.contact?.business_name === "Local fixture")).toBe(true);
});

test("missing or invalid token never reads private cart members", async () => {
  expect(await ownedCart(admin, undefined)).toBeNull();
  expect(from).not.toHaveBeenCalled();
  authorized = false;
  expect(await ownedCart(admin, "not-an-owner")).toBeNull();
  expect(from.mock.calls.map(([table]) => table)).toEqual(["reservation_carts"]);
});

test("member query failure does not return a partial cart", async () => {
  bookingError = true;
  await expect(ownedCart(admin, "private-cookie-token")).rejects.toThrow("Could not load cart bookings");
});
