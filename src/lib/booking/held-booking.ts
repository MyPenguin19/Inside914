import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { hashHoldToken } from "./hold-token";

export type HeldBooking = {
  id: string;
  editionId: string;
  zoneName: string;
  issueMonth: string;
  size: "standard" | "double";
  priceCents: number;
  expiresAt: string;
  positions: { label: string; side: string }[];
  state: "active" | "expired";
};

type Row = {
  id: string;
  edition_id: string;
  size: string;
  price_cents: number;
  status: string;
  hold_expires_at: string | null;
  editions: { issue_month: string; zones: { name: string } | null } | null;
  booking_slots: { slots: { label: string; side: string } | null }[];
};

// The pending hold behind a browser's hold token, or null if there is none.
export async function getHeldBooking(admin: SupabaseClient<Database>, token: string): Promise<HeldBooking | null> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, edition_id, size, price_cents, status, hold_expires_at, editions(issue_month, zones(name)), booking_slots(slots(label, side))",
    )
    .eq("hold_token_hash", hashHoldToken(token))
    .returns<Row[]>()
    .maybeSingle();
  if (error) throw new Error(`Could not load hold: ${error.message}`);
  if (!data || !["pending", "released"].includes(data.status) || !data.hold_expires_at) return null;

  const active = data.status === "pending" && Date.parse(data.hold_expires_at) > Date.now();
  return {
    id: data.id,
    editionId: data.edition_id,
    zoneName: data.editions?.zones?.name ?? "",
    issueMonth: data.editions?.issue_month ?? "",
    size: data.size as "standard" | "double",
    priceCents: data.price_cents,
    expiresAt: data.hold_expires_at,
    positions: data.booking_slots
      .flatMap((bs) => (bs.slots ? [bs.slots] : []))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true })),
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
