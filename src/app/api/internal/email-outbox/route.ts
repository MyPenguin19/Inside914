import { timingSafeEqual } from "node:crypto";
import { processDueCardRemovals } from "@/lib/checkout/card-removal";
import { getStripe } from "@/lib/checkout/stripe";
import { processDueOutbox } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

// Retries due emails and removes saved cards still attached to cancelled reservations. Scheduled
// by Vercel Cron (vercel.json; once a day on the Hobby plan), which sends
// "Authorization: Bearer $CRON_SECRET". Disabled without CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const results = await processDueOutbox(admin);
  let cardRemovals: string[] = [];
  try {
    cardRemovals = await processDueCardRemovals(admin, getStripe());
  } catch (error) {
    console.error("card removal job failed", error instanceof Error ? error.message.slice(0, 80) : "unknown");
  }
  return Response.json({ processed: results.length, results, cardRemovals });
}
