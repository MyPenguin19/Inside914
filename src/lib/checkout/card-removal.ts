import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFakeStripe } from "@/lib/dev/fake-stripe";
import { isDevTestModeActive, isTestStripeId } from "@/lib/dev/test-mode";
import { LIVE_COLLECTION_RELEASED } from "@/lib/payments/environment";
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

  // A group saves one card for several independent campaign reservations.
  const { data: active, error: activeError } = await admin.from("bookings").select("id")
    .eq("stripe_payment_method_id", b.stripe_payment_method_id).not("status", "in", "(cancelled,released)").limit(1);
  if (activeError) throw activeError;
  if (active?.length) return "skipped";
  const testCard = isTestStripeId(b.stripe_payment_method_id);
  // This release permits no live Stripe writes, including deferred cron detaches.
  // Local fixtures use provider mocks. Revoked DB authority remains enforced even
  // while a card is retained for this or another campaign.
  if (!testCard && !LIVE_COLLECTION_RELEASED && !isDevTestModeActive()) return "skipped";
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
    .eq("stripe_payment_method_id", b.stripe_payment_method_id)
    .eq("status", "cancelled")
    .is("card_removed_at", null);
  if (updateError) throw new Error(`Could not record card removal: ${updateError.message}`);
  return "removed";
}

// Stable-key pagination skips cards retained for active reservations without starving
// unrelated cancellations. Updating a processed row cannot shift the next page.
export async function processDueCardRemovals(admin: Admin, stripe: StripeClient, limit = 20) {
  const results: CardRemoval[] = [];
  let cursor: string | null = null;
  while (results.length < limit) {
    let query = admin.from("bookings").select("id")
      .eq("status", "cancelled").not("stripe_payment_method_id", "is", null)
      .is("card_removed_at", null).order("id").limit(limit);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error(`Could not list card removals: ${error.message}`);
    if (!data?.length) break;
    for (const b of data) {
      cursor = b.id;
      const result = await removeSavedCard(admin, stripe, b.id);
      if (result !== "skipped") results.push(result);
      if (results.length >= limit) break;
    }
    if (data.length < limit) break;
  }
  return results;
}
