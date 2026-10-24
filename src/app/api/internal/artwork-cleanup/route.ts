import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupAbandonedArtwork } from "@/lib/artwork/cleanup";

// Cleanup never calls Stripe or changes campaign/booking status. Durable failures notify the owner.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const result=await cleanupAbandonedArtwork(createAdminClient());
  notifyOwnerAfterResponse();
  return Response.json(result);
}
