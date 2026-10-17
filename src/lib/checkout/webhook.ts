import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { z } from "zod";
import type { SendEmail } from "@/lib/email/outbox";
import { processOutboxForBooking } from "@/lib/email/outbox";
import type { Database } from "@/lib/supabase/database.types";
import { completeReservation } from "./service";
import type { StripeClient } from "./stripe";

type Admin = SupabaseClient<Database>;

const SETUP_EVENTS: Partial<Record<string, "succeeded" | "failed" | "canceled">> = {
  "setup_intent.succeeded": "succeeded",
  "setup_intent.setup_failed": "failed",
  "setup_intent.canceled": "canceled",
};

// Records what Stripe reported for this booking's CURRENT SetupIntent only (an event for another
// booking's or an older intent changes nothing), and never lets an older event overwrite a newer
// one, so late or out-of-order deliveries can't roll the status back.
export async function recordSetupStatus(
  admin: Admin,
  bookingId: string,
  setupIntentId: string,
  status: "succeeded" | "failed" | "canceled",
  eventCreated: number,
) {
  const at = new Date((Number.isFinite(eventCreated) ? eventCreated : Date.now() / 1000) * 1000).toISOString();
  const { error } = await admin
    .from("bookings")
    .update({ stripe_setup_status: status, stripe_setup_status_at: at })
    .eq("id", bookingId)
    .eq("stripe_setup_intent_id", setupIntentId)
    .or(`stripe_setup_status_at.is.null,stripe_setup_status_at.lt."${at}"`);
  if (error) throw new Error(`Could not record setup status: ${error.message}`);
}

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
    const status = SETUP_EVENTS[event.type];
    if (!status) return "ignored" as const;
    const intent = event.data.object as Stripe.SetupIntent;
    const bookingId = intent.metadata?.booking_id;
    if (!bookingId || !z.uuid().safeParse(bookingId).success) return "ignored" as const;

    await recordSetupStatus(admin, bookingId, intent.id, status, event.created);
    if (status === "succeeded") {
      // Never trusts the event's word: completeReservation re-reads the SetupIntent from Stripe.
      const outcome = await completeReservation(admin, stripe, bookingId);
      if (outcome === "confirmed" || outcome === "already_confirmed") {
        await processOutboxForBooking(admin, bookingId, send).catch(() => {});
      }
    }
    // failed / canceled: the customer can try another card on the payment page; nothing is charged.
    return "handled" as const;
  } catch (error) {
    // Forget the event so Stripe's retry is processed again.
    await admin.from("stripe_events").delete().eq("id", event.id);
    throw error;
  }
}
