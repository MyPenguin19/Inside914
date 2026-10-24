import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Additional application guard, never a replacement for assert_charge_consent.
// A request cannot be assumed ineligible until an administrator reviews it.
export async function bookingAllowsCollection(db: SupabaseClient<Database>, bookingId: string) {
  const booking = await db.from("bookings").select("status").eq("id", bookingId).maybeSingle();
  if (booking.error) throw new Error("Could not verify reservation authorization");
  if (!booking.data || !["reserved", "charge_failed"].includes(booking.data.status)) return false;
  const requests = await db.from("customer_requests").select("id")
    .eq("booking_id", bookingId).eq("kind", "cancellation").eq("status", "open").limit(1);
  if (requests.error) throw new Error("Could not verify cancellation requests");
  return requests.data?.length === 0;
}

export async function assertBookingCollection(db: SupabaseClient<Database>, bookingId: string) {
  if (!await bookingAllowsCollection(db, bookingId)) {
    throw new Error("Reservation is canceled, inactive, or has an unresolved cancellation request");
  }
}
