import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { SendEmail } from "@/lib/email/outbox";
import { processOutboxForBooking } from "@/lib/email/outbox";
import type { Database } from "@/lib/supabase/database.types";
import { completeReservation } from "./service";
import type { StripeClient } from "./stripe";

type Admin = SupabaseClient<Database>;

// Handles one VERIFIED Stripe event (signature already checked by the route). Each event id is
// recorded first; a duplicate delivery is acknowledged without doing anything again.
// Returns "duplicate" | "handled" | "ignored". Throws to make Stripe retry later.
export async function handleStripeEvent(admin: Admin, stripe: StripeClient, event: Stripe.Event, send?: SendEmail) {
  const { error: insertError, data } = await admin
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (insertError) throw new Error(`Could not record event: ${insertError.message}`);
  if (!data?.length) return "duplicate" as const;

  try {
    if (event.type === "setup_intent.succeeded") {
      const bookingId = (event.data.object as Stripe.SetupIntent).metadata?.booking_id;
      if (!bookingId) return "ignored" as const;
      const outcome = await completeReservation(admin, stripe, bookingId);
      if (outcome === "confirmed" || outcome === "already_confirmed") {
        await processOutboxForBooking(admin, bookingId, send).catch(() => {});
      }
      return "handled" as const;
    }
    // setup_failed / canceled / requires_action: the customer sees and handles these in the
    // browser; there is nothing to change on our side.
    return "ignored" as const;
  } catch (error) {
    // Forget the event so Stripe's retry is processed again.
    await admin.from("stripe_events").delete().eq("id", event.id);
    throw error;
  }
}
