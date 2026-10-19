import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFakeStripe } from "@/lib/dev/fake-stripe";
import { isTestStripeId } from "@/lib/dev/test-mode";
import type { Database } from "@/lib/supabase/database.types";
import type { StripeClient } from "./stripe";

// After Inside914 cancels a reservation, the customer's saved card is detached in Stripe so it
// can never be charged. Runs right after the cancel and again from the email-outbox cron for any
// cancelled booking whose card is still attached. Detach is the only Stripe call: nothing charges.

type Admin = SupabaseClient<Database>;
export type CardRemoval = "removed" | "skipped" | "failed";

// Stripe says the card is already gone or no longer attached: nothing left to remove.
function alreadyGone(error: unknown) {
  const e = error as { code?: string; message?: string };
  return e?.code === "resource_missing" || /not attached/i.test(e?.message ?? "");
}

export async function removeSavedCard(admin: Admin, stripe: StripeClient, bookingId: string): Promise<CardRemoval> {
  const { data: b, error } = await admin
    .from("bookings")
    .select("id, status, stripe_payment_method_id, card_removed_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(`Could not load booking: ${error.message}`);
  if (!b || b.status !== "cancelled" || !b.stripe_payment_method_id || b.card_removed_at) return "skipped";

  const testCard = isTestStripeId(b.stripe_payment_method_id);
  if (!testCard && isFakeStripe(stripe)) return "skipped"; // a real card is only removed with real Stripe
  if (!testCard) {
    try {
      await stripe.paymentMethods.detach(b.stripe_payment_method_id);
    } catch (detachError) {
      if (!alreadyGone(detachError)) {
        console.error("card removal failed", (detachError as { code?: string })?.code ?? "unknown"); // no ids or customer data
        return "failed";
      }
    }
  }

  const { error: updateError } = await admin
    .from("bookings")
    .update({ card_removed_at: new Date().toISOString() })
    .eq("id", b.id)
    .is("card_removed_at", null);
  if (updateError) throw new Error(`Could not record card removal: ${updateError.message}`);
  return "removed";
}

// Retries every cancelled booking whose card is still attached, oldest first.
export async function processDueCardRemovals(admin: Admin, stripe: StripeClient, limit = 20) {
  const { data, error } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "cancelled")
    .not("stripe_payment_method_id", "is", null)
    .is("card_removed_at", null)
    .order("cancelled_at")
    .limit(limit);
  if (error) throw new Error(`Could not list card removals: ${error.message}`);
  const results: CardRemoval[] = [];
  for (const b of data ?? []) results.push(await removeSavedCard(admin, stripe, b.id));
  return results;
}
