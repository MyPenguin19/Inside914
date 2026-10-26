"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientAddress } from "@/lib/booking/hold-rate-limit";
import { processDelivery } from "@/lib/email/delivery";
import { queueContactMessage } from "@/lib/contact/service";
import { CONTACT_UNAVAILABLE, type ContactMessageState } from "@/lib/contact/schema";

export async function submitContactMessage(_previous: ContactMessageState, form: FormData): Promise<ContactMessageState> {
  try {
    // This public action can only enqueue a validated message to the fixed owner inbox.
    // Next.js Server Actions enforce same-origin requests. No customer/admin data is read.
    const db = createAdminClient();
    const input = Object.fromEntries(["name", "email", "phone", "message", "website", "submissionId"].map(key => [key, form.get(key)]));
    const result = await queueContactMessage(db, input, clientAddress(await headers()));
    if (result.deliveryId) {
      const id = result.deliveryId;
      try { after(async () => { try { await processDelivery(db, id); } catch { /* The durable queue retains the message for retry. */ } }); }
      catch { /* The existing email worker also processes pending deliveries. */ }
    }
    return result.state;
  } catch {
    // Never expose provider errors, email content, credentials, or database details.
    return { ok: false, message: CONTACT_UNAVAILABLE };
  }
}
