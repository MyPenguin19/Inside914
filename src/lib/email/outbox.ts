import { getCollectionContext } from "@/lib/payments/environment";
import { deliverPaymentNotice } from "@/lib/payments/notices";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueAccessToken } from "@/lib/access/tokens";
import { getReservationView } from "@/lib/checkout/reservation";
import { getAppUrl, getEmailEnv } from "@/lib/env/checkout";
import type { Database } from "@/lib/supabase/database.types";
import { reservationCancelledEmail } from "./reservation-cancelled";
import { reservationConfirmedEmail } from "./reservation-confirmed";

// Transactional email outbox. Rows are queued inside confirm_booking() (same transaction as the
// reservation), so an email problem cannot undo it. Atomic claims prevent concurrent sends.
// Stable encrypted envelopes and bounded provider retries live in email_deliveries.

type Admin = SupabaseClient<Database>;

export { sendWithResend } from "./provider";
export type { EmailMessage, SendEmail } from "./provider";
import { sendWithResend, type SendEmail } from "./provider";
import { processDelivery, queueDelivery, TEST_NOT_DELIVERED } from "./delivery";
export { TEST_NOT_DELIVERED };
const MAX_ATTEMPTS = 8;
const backoffMinutes = (attempts: number) => Math.min(2 ** attempts, 360);

type OutboxRow = Database["public"]["Tables"]["email_outbox"]["Row"];

// Atomically take a due row so only one worker sends it. A claim lasts 10 minutes, so a worker
// that crashed mid-send ("sending" forever) is retried after that.
async function claim(admin: Admin, rowId: string): Promise<OutboxRow | null> {
  let query = admin
    .from("email_outbox")
    .update({ status: "sending", next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    .eq("id", rowId)
    .in("status", ["pending", "failed", "sending"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS);
  // A disabled release must not consume attempts or mark live notices delivered.
  try { getCollectionContext(); } catch { query=query.not("kind","in","(payment_needed,payment_receipt)"); }
  const {data}=await query.select("*").maybeSingle();
  return data;
}

// Sends one claimed row's email and marks it sent. Throws on failure (the caller records it).
async function deliver(
  admin: Admin,
  row: OutboxRow,
  to: string,
  isTest: boolean,
  email: { subject: string; html: string; text: string },
  send: SendEmail,
) {
  const id = await queueDelivery(admin, `outbox:${row.id}`, { from:getEmailEnv().from,to,...email }, {outboxId:row.id,isTest});
  return processDelivery(admin,id,send);
}

export async function processOutboxRow(admin: Admin, rowId: string, send: SendEmail = sendWithResend) {
  const existing=await admin.from("email_deliveries").select("id").eq("outbox_id",rowId).maybeSingle();
  if(existing.error) throw new Error("email_delivery_lookup_failed");
  if(existing.data) return processDelivery(admin,existing.data.id,send);
  const row = await claim(admin, rowId);
  if (!row) return "skipped" as const;

  try {
    if (row.kind === "payment_needed" || row.kind === "payment_receipt") {
      const providerId=await deliverPaymentNotice(admin,row,send);
      const {error}=await admin.from("email_outbox").update({status:"sent",attempts:row.attempts+1,provider_message_id:providerId,sent_at:new Date().toISOString(),last_error:null}).eq("id",row.id);
      if(error) throw new Error("Could not record local payment notice preview");
      return "sent" as const;
    }
    // Older code retried with new links/keys. No durable envelope means an earlier
    // ambiguous attempt cannot safely be reconciled or resent automatically.
    if(row.attempts>0) {
      await admin.from("email_outbox").update({status:"investigation",last_error:"legacy_attempt_requires_reconciliation"}).eq("id",row.id);
      return "investigation" as const;
    }
    const view = await getReservationView(admin, row.booking_id);
    const { supportEmail } = getEmailEnv();

    // Sent when Inside914 cancels a confirmed reservation (queued by admin_cancel_booking), or the
    // whole campaign because it didn't fill by its deadline (queued by admin_set_campaign_status).
    if (row.kind === "reservation_cancelled" || row.kind === "campaign_cancelled_not_full") {
      if (!view || view.status !== "cancelled" || !view.reference || !view.email) throw new Error("reservation_not_cancelled");
      const email = reservationCancelledEmail({
        businessName: view.businessName ?? "",
        contactName: view.contactName ?? "",
        reference: view.reference,
        zoneName: view.zoneName,
        issueMonth: view.issueMonth,
        side: view.area.side,
        positions: view.positions.map((p) => p.label),
        supportEmail,
        test: view.isTest,
        notFull: row.kind === "campaign_cancelled_not_full",
        card: view.card,
      });
      return await deliver(admin, row, view.email, view.isTest, email, send);
    }

    if (!view || view.status !== "reserved" || !view.reference || !view.email) throw new Error("reservation_not_ready");

    // Persist this link in the encrypted envelope before the first provider request.
    const access = await issueAccessToken(admin, row.booking_id);
    const accepted=await admin.from("payment_consents").select("terms_version").eq("booking_id",row.booking_id).order("consented_at",{ascending:false}).limit(1).maybeSingle();
    if(accepted.error) throw new Error("consent_lookup_failed");
    const legacy=["2026-10-16-draft-1","square-zones-v1"].includes(accepted.data?.terms_version??"");
    const email = reservationConfirmedEmail({
      ...(legacy?{deadlinePolicy:"Your originally accepted deadline and billing terms remain unchanged. If the campaign does not fill by its stated deadline, your reservation is canceled without charge under those terms. Contact Inside914 about any proposed extension."}:{}),
      businessName: view.businessName ?? "",
      contactName: view.contactName ?? "",
      reference: view.reference,
      zoneName: view.zoneName,
      households: view.households,
      issueMonth: view.issueMonth,
      artworkDeadline: view.artworkDeadline,
      side: view.area.side,
      positions: view.positions.map((p) => p.label),
      size: view.size,
      priceCents: view.priceCents,
      reservationUrl: `${getAppUrl()}/r/${access.token}`,
      supportEmail,
      test: view.isTest,
      testPricing: view.pricingMode === "test",
    });

    return await deliver(admin, row, view.email, view.isTest, email, send);
  } catch (error) {
    const attempts = row.attempts; // Preparation never reached a provider; preserve safe retry.
    // Error codes only: never log customer details or tokens.
    const code = "email_preparation_failed"; // Never persist arbitrary exception text or private URLs.
    void error;
    await admin
      .from("email_outbox")
      .update({
        status: "failed",
        attempts,
        last_error: code,
        next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
      })
      .eq("id", row.id);
    return "failed" as const;
  }
}

// Send (or retry) whatever is due for one booking.
export async function processOutboxForBooking(admin: Admin, bookingId: string, send?: SendEmail) {
  const { data } = await admin.from("email_outbox").select("id").eq("booking_id", bookingId);
  return Promise.all((data ?? []).map((r) => processOutboxRow(admin, r.id, send)));
}

// Send (or retry) everything due, oldest first. Run by the email-outbox cron route.
export async function processDueOutbox(admin: Admin, limit = 20, send?: SendEmail) {
  const { data } = await admin
    .from("email_outbox")
    .select("id")
    .in("status", ["pending", "failed", "sending"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("next_attempt_at")
    .limit(limit);
  const results = [];
  for (const r of data ?? []) results.push(await processOutboxRow(admin, r.id, send));
  return results;
}
