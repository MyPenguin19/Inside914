import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hashHoldToken } from "./hold-token";

export type HeldBooking = {
  id: string;
  cartId?: string | null;
  editionId: string;
  zoneName: string;
  issueMonth: string;
  size: import("@/lib/booking/products").BookingSize;
  priceCents: number;
  pricingMode: "launch" | "test";
  expiresAt: string;
  positions: { label: string; side: "front" | "back"; x: number; y: number; width: number; height: number }[];
  holdExtensions: number;
  state: "active" | "expired";
};

type Row = {
  id: string;
  cart_id: string | null;
  edition_id: string;
  size: string;
  price_cents: number;
  pricing_mode: string;
  status: string;
  hold_expires_at: string | null;
  hold_extensions: number;
  editions: { issue_month: string; zones: { name: string } | null } | null;
  booking_slots: {
    slots: { label: string; side: string; x_in: number; y_in: number; width_in: number; height_in: number } | null;
  }[];
};

// The pending hold behind a browser's hold token, or null if there is none.
export async function getHeldBooking(admin: SupabaseClient<Database>, token: string): Promise<HeldBooking | null> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, cart_id, edition_id, size, price_cents, pricing_mode, status, hold_expires_at, hold_extensions, editions(issue_month, zones(name)), booking_slots(slots(label, side, x_in, y_in, width_in, height_in))",
    )
    .eq("hold_token_hash", hashHoldToken(token))
    .returns<Row[]>()
    .maybeSingle();
  if (error) throw new Error(`Could not load hold: ${error.message}`);
  if (!data || !["pending", "released"].includes(data.status) || !data.hold_expires_at) return null;

  const active = data.status === "pending" && Date.parse(data.hold_expires_at) > Date.now();
  return {
    id: data.id,
    cartId: data.cart_id,
    editionId: data.edition_id,
    zoneName: data.editions?.zones?.name ?? "",
    issueMonth: data.editions?.issue_month ?? "",
    size: data.size as import("@/lib/booking/products").BookingSize,
    priceCents: data.price_cents,
    pricingMode: data.pricing_mode === "test" ? "test" : "launch",
    expiresAt: data.hold_expires_at,
    positions: data.booking_slots
      .flatMap((bs) => (bs.slots ? [bs.slots] : []))
      .map((s) => ({
        label: s.label,
        side: s.side as "front" | "back",
        x: Number(s.x_in),
        y: Number(s.y_in),
        width: Number(s.width_in),
        height: Number(s.height_in),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true })),
    holdExtensions: data.hold_extensions,
    state: active ? "active" : "expired",
  };
}

// Gives up a still-pending hold early (the trigger frees its slots). No-op otherwise.
export async function releaseHold(admin: SupabaseClient<Database>, token: string) {
  const { error } = await admin
    .from("bookings")
    .update({ status: "released", updated_at: new Date().toISOString() })
    .eq("hold_token_hash", hashHoldToken(token))
    .eq("status", "pending");
  if (error) throw new Error(`Could not release hold: ${error.message}`);
}
