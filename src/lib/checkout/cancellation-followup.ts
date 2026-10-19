import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processOutboxForBooking } from "@/lib/email/outbox";
import type { Database } from "@/lib/supabase/database.types";
import { removeSavedCard, type CardRemoval } from "./card-removal";
import type { StripeClient } from "./stripe";

// After reservations are cancelled: remove each saved card FIRST, then send the queued emails, so
// an email only says a card was removed once Stripe confirmed it. Never throws; anything that
// fails is retried by the daily job (cancelled bookings with a card still attached, due emails).
export async function followUpCancellations(admin: SupabaseClient<Database>, stripe: () => StripeClient, bookingIds: string[]) {
  let client: StripeClient | null = null;
  try {
    client = stripe();
  } catch (error) {
    console.error("card removal unavailable", error instanceof Error ? error.message.slice(0, 80) : "unknown");
  }
  const cards: CardRemoval[] = [];
  for (const id of bookingIds) {
    cards.push(client ? await removeSavedCard(admin, client, id).catch(() => "failed" as const) : "failed");
  }
  const emails: string[] = [];
  for (const id of bookingIds) {
    emails.push(...(await processOutboxForBooking(admin, id).catch((): string[] => ["failed"])));
  }
  return { cards, emails };
}
