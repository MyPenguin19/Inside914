import { timingSafeEqual } from "node:crypto";
import { processDueOutbox } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

// Retries due confirmation emails. Meant for a scheduled job (Vercel Cron sends
// "Authorization: Bearer $CRON_SECRET"). Not scheduled yet; disabled without CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await processDueOutbox(createAdminClient());
  return Response.json({ processed: results.length, results });
}
