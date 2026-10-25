import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getEmailEnv } from "@/lib/env/checkout";
import { processDelivery, queueDelivery } from "./delivery";
import type { SendEmail } from "./provider";

export function getOwnerVerificationConfig() {
  const to = z.email().safeParse(process.env.ADMIN_NOTIFICATION_EMAIL?.trim());
  const release = process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.VERCEL_ENV !== "production" || !to.success || !release || !/^[a-f0-9]{40}$/.test(release) || !getEmailEnv().resendApiKey) {
    throw new Error("owner_verification_unavailable");
  }
  // Neither the destination nor the idempotency identity comes from the browser.
  return { to: to.data, logicalKey: `owner-verification:${release}` };
}

export async function sendOwnerVerification(db: SupabaseClient<Database>, send?: SendEmail) {
  const { to, logicalKey } = getOwnerVerificationConfig();
  const text = "This owner-authorized test verifies email sending from the deployed Inside914 app using its configured Resend key. No customer reservation or payment operation was performed.";
  const id = await queueDelivery(db, logicalKey, {
    from: getEmailEnv().from, to,
    subject: "Inside914 — deployed app email verification",
    text, html: `<html lang="en"><body><h1>Inside914 email verification</h1><p>${text}</p></body></html>`,
  });
  // Process only this delivery. Never invoke the customer outbox or payment worker.
  await processDelivery(db, id, send);
  const { data, error } = await db.from("email_deliveries").select("status,provider_outcome").eq("id", id).single();
  if (error) throw new Error("owner_verification_status_unavailable");
  return data;
}
