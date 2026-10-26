import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerEnv } from "@/lib/env/server";
import { getEmailEnv } from "@/lib/env/checkout";
import { devTestMode } from "@/lib/dev/test-mode";
import { queueDelivery } from "@/lib/email/delivery";
import { escapeHtml } from "@/lib/email/escape";
import { SUPPORT_EMAIL } from "@/lib/support";
import { ContactMessage, CONTACT_RECEIVED, type ContactMessageState } from "./schema";

type Db = SupabaseClient<Database>;
type Result = { state: ContactMessageState; deliveryId?: string };

export async function queueContactMessage(db: Db, raw: unknown, address: string): Promise<Result> {
  const parsed = ContactMessage.safeParse(raw);
  if (!parsed.success) {
    const errors: ContactMessageState["errors"] = {};
    for (const field of ["name", "email", "phone", "message"] as const) {
      const issue = parsed.error.issues.find(issue => issue.path[0] === field);
      if (issue) errors[field] = issue.message;
    }
    return { state: { ok: false, errors, message: "Please check your details and try again." } };
  }
  const input = parsed.data;
  if (input.website) return { state: { ok: true, message: CONTACT_RECEIVED } };

  // Reuse the service-only, concurrency-safe limiter, with a separate contact namespace.
  // Only keyed hashes reach the database; neither raw IPs nor addresses are stored here.
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  const hash = (value: string) => createHmac("sha256", secret).update(`inside914-contact:${value}`).digest("hex");
  for (const [key, max] of [[`ip:${address}`, 5], [`email:${input.email}`, 3], ["global", 100]] as const) {
    const result = await db.rpc("note_hold_attempt", { p_visitor_hash: hash(key), p_max: max, p_window_seconds: 3600 });
    if (result.error) throw new Error("contact_rate_limit_unavailable");
    if (!result.data) return { state: { ok: false, message: "Too many messages. Please try again in an hour, or contact us by email or phone." } };
  }

  const text = `New message from the Inside914 contact form\n\nName: ${input.name}\nEmail: ${input.email}\nPhone: ${input.phone || "Not provided"}\n\nMessage:\n${input.message}`;
  const isTest = devTestMode().active;
  // Stable for retries, bound to the complete validated payload, with no PII in the key.
  const logicalKey = `contact:${hash(JSON.stringify(input))}`;
  const deliveryId = await queueDelivery(db, logicalKey, {
    from: getEmailEnv().from,
    to: SUPPORT_EMAIL.toLowerCase(),
    replyTo: input.email,
    subject: "New message from Inside914 contact form",
    text,
    html: `<html lang="en"><body><h1>Inside914 contact message</h1><p><strong>Name:</strong> ${escapeHtml(input.name)}<br><strong>Email:</strong> ${escapeHtml(input.email)}<br><strong>Phone:</strong> ${escapeHtml(input.phone || "Not provided")}</p><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p></body></html>`,
  }, { isTest });
  return { deliveryId, state: { ok: true, message: isTest ? "Test message saved locally. No email was sent." : CONTACT_RECEIVED } };
}
