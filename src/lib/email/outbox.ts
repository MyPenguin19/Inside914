import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueAccessToken, revokeAccessToken } from "@/lib/access/tokens";
import { getReservationView } from "@/lib/checkout/reservation";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
import { getAppUrl, getEmailEnv } from "@/lib/env/checkout";
import type { Database } from "@/lib/supabase/database.types";
import { reservationCancelledEmail } from "./reservation-cancelled";
import { reservationConfirmedEmail } from "./reservation-confirmed";

// Transactional email outbox. Rows are queued inside confirm_booking() (same transaction as the
// reservation), so an email problem can never undo or corrupt a reservation. Each row is claimed
// atomically before sending, and marked sent once, so retries never send it twice.

type Admin = SupabaseClient<Database>;

export type EmailMessage = { to: string; subject: string; html: string; text: string; idempotencyKey: string };
export type SendEmail = (message: EmailMessage) => Promise<{ id: string }>;

export const TEST_NOT_DELIVERED = "not-delivered:test-reservation";

// Development TEST reservations are never emailed. In dev, the email is written to .dev-emails/
// for review instead (labeled [TEST]).
async function writeTestPreview(rowId: string, message: EmailMessage) {
  if (!isDevTestModeActive()) return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(".dev-emails", { recursive: true });
  await writeFile(`.dev-emails/${rowId}.html`, message.html);
}

const MAX_ATTEMPTS = 8;
const backoffMinutes = (attempts: number) => Math.min(2 ** attempts, 360); // 2, 4, 8 ... up to 6 h

// Sends through Resend's HTTP API (no SDK). Throws on any failure.
export const sendWithResend: SendEmail = async (message) => {
  const { resendApiKey, from } = getEmailEnv();
  if (!resendApiKey) throw new Error("email_not_configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!response.ok) throw new Error(`resend_${response.status}`);
  const body = (await response.json()) as { id?: string };
  return { id: body.id ?? "unknown" };
};

type OutboxRow = Database["public"]["Tables"]["email_outbox"]["Row"];

// Atomically take a due row so only one worker sends it. A claim lasts 10 minutes, so a worker
// that crashed mid-send ("sending" forever) is retried after that.
async function claim(admin: Admin, rowId: string): Promise<OutboxRow | null> {
  const { data } = await admin
    .from("email_outbox")
    .update({ status: "sending", next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    .eq("id", rowId)
    .in("status", ["pending", "failed", "sending"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .select("*")
    .maybeSingle();
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
  const message = { to, ...email, idempotencyKey: `${row.id}:${row.attempts + 1}` };
  // Checked on the reservation itself (not the current mode), so a test reservation can never
  // reach Resend, even if it's processed later somewhere test mode is off.
  const sent = isTest ? (await writeTestPreview(row.id, message), { id: TEST_NOT_DELIVERED }) : await send(message);
  await admin
    .from("email_outbox")
    .update({ status: "sent", attempts: row.attempts + 1, provider_message_id: sent.id, sent_at: new Date().toISOString(), last_error: null })
    .eq("id", row.id);
  return "sent" as const;
}

export async function processOutboxRow(admin: Admin, rowId: string, send: SendEmail = sendWithResend) {
  const row = await claim(admin, rowId);
  if (!row) return "skipped" as const;

  let accessTokenId: string | null = null;
  try {
    const view = await getReservationView(admin, row.booking_id);
    const { supportEmail } = getEmailEnv();

    // Sent when Inside914 cancels a confirmed reservation (queued by admin_cancel_booking).
    if (row.kind === "reservation_cancelled") {
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
      });
      return await deliver(admin, row, view.email, view.isTest, email, send);
    }

    if (!view || view.status !== "reserved" || !view.reference || !view.email) throw new Error("reservation_not_ready");

    // A fresh link per attempt; a failed attempt's link is revoked below.
    const access = await issueAccessToken(admin, row.booking_id);
    accessTokenId = access.id;
    const email = reservationConfirmedEmail({
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
    if (accessTokenId) await revokeAccessToken(admin, accessTokenId).catch(() => {});
    const attempts = row.attempts + 1;
    // Error codes only: never log customer details or tokens.
    const code = error instanceof Error ? error.message.slice(0, 80) : "unknown";
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
