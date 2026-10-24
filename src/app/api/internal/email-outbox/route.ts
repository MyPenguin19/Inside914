import { processDueDeliveries } from "@/lib/email/delivery";
import { timingSafeEqual } from "node:crypto";
import { processDueCardRemovals } from "@/lib/checkout/card-removal";
import { getStripe } from "@/lib/checkout/stripe";
import { processDueOutbox } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily job: closes campaigns whose reservation deadline passed, retries due emails, and removes
// saved cards still attached to cancelled reservations. Scheduled
// by Vercel Cron (vercel.json; once a day on the Hobby plan), which sends
// "Authorization: Bearer $CRON_SECRET". Disabled without CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data: campaignsClosed, error: closeError } = await admin.rpc("close_past_deadline_campaigns");
  if (closeError) console.error("closing past-deadline campaigns failed", closeError.code);
  // Cards first, so a cancellation email sent below can say the card is already removed.
  let cardRemovals: string[] = [];
  try {
    cardRemovals = await processDueCardRemovals(admin, getStripe());
  } catch (error) {
    console.error("card removal job failed", error instanceof Error ? error.message.slice(0, 80) : "unknown");
  }
  const results = await processDueOutbox(admin);
  const deliveries = await processDueDeliveries(admin);
  return Response.json({ deliveries, campaignsClosed: campaignsClosed ?? 0, processed: results.length, results, cardRemovals });
}
