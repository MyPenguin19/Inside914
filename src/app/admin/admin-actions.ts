"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { adminErrorMessage, parseCampaignForm, parseExtendDeadlineForm, type CampaignFieldErrors } from "@/lib/admin/campaign-form";
import { findTemplate } from "@/lib/admin/layouts";
import { processDueCardRemovals, removeSavedCard } from "@/lib/checkout/card-removal";
import { getStripe } from "@/lib/checkout/stripe";
import { processOutboxForBooking } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

// Every admin change goes through here: requireAdmin() first, input validated, then ONE admin_*
// database function called AS THE SIGNED-IN ADMIN (it re-checks admin rights, locks, audits).
// Nothing here can charge a card. The only Stripe call is removing a cancelled customer's saved
// card (detach), which can't charge anything.

export type ActionResult = { ok?: boolean; message?: string; errors?: CampaignFieldErrors; values?: Record<string, string> };

const uuid = z.uuid();
const reason = (max: number) => z.string().trim().min(1, "Please give a reason.").max(max);

function done(message: string): ActionResult {
  refresh();
  return { ok: true, message };
}

// ---- Campaigns ---------------------------------------------------------------------------

export async function createCampaign(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const parsed = parseCampaignForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.raw };
  const template = findTemplate(parsed.value.layout_template)!;
  const { data, error } = await supabase.rpc("admin_create_campaign", { p: parsed.value, p_slots: template.slots });
  if (error) return { message: adminErrorMessage(error), values: parsed.raw };
  redirect(`/admin/campaigns/${data}`);
}

export async function updateCampaign(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { message: "That campaign doesn't exist." };

  // Once anyone has booked, only the name and target quantity may change (the database enforces
  // this too); the form only sends those then.
  const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("edition_id", id.data).neq("status", "released");
  const locked = form.get("locked") === "true" || (count ?? 0) > 0;
  const parsed = parseCampaignForm(form);
  if (!parsed.ok) {
    const relevant = locked ? { name: parsed.errors.name, target_quantity: parsed.errors.target_quantity } : parsed.errors;
    if (Object.values(relevant).some(Boolean)) return { errors: relevant, values: parsed.raw };
  }
  const v = parsed.ok ? parsed.value : null;
  const p = locked
    ? { name: String(form.get("name")).trim(), target_quantity: Number(form.get("target_quantity")) }
    : { ...v, zone_id: undefined, layout_template: undefined, unit_price_cents: undefined, double_price_cents: undefined };
  const { error } = await supabase.rpc("admin_update_campaign", { p_id: id.data, p: JSON.parse(JSON.stringify(p)) });
  if (error) return { message: adminErrorMessage(error), values: parsed.raw };
  redirect(`/admin/campaigns/${id.data}`);
}

const StatusAction = z.enum(["open", "pause", "resume", "close", "cancel", "approve_for_print", "mark_printed", "mark_mailed", "complete"]);

export async function setCampaignStatus(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const id = uuid.safeParse(form.get("id"));
  const action = StatusAction.safeParse(form.get("action"));
  if (!id.success || !action.success) return { message: "That action isn't available." };
  const { data, error } = await supabase.rpc("admin_set_campaign_status", { p_id: id.data, p_action: action.data });
  if (error) return { message: adminErrorMessage(error) };
  if (data === "already") return done("Already done: nothing changed.");
  if (action.data === "cancel") return done(`Campaign canceled.${await afterCampaignCancel(id.data)}`);
  return done("Done.");
}

// Reservations cancelled with the campaign: email each customer and remove their saved cards
// (secret-key client, only after requireAdmin() and a successful cancel). The daily job retries.
async function afterCampaignCancel(editionId: string) {
  const admin = createAdminClient();
  const { data: bookings } = await admin.from("bookings").select("id").eq("edition_id", editionId).eq("status", "cancelled");
  if (!bookings?.length) return "";
  const emails = (await Promise.all(bookings.map((b) => processOutboxForBooking(admin, b.id).catch((): string[] => [])))).flat();
  const cards = await (async () => processDueCardRemovals(admin, getStripe(), 50))().catch((): string[] => ["failed"]);
  const sent = emails.filter((r) => r === "sent").length;
  return [
    sent ? ` ${sent} ${sent === 1 ? "customer was" : "customers were"} emailed.` : "",
    emails.includes("failed") ? " Some emails will be retried." : "",
    cards.includes("failed") ? " Removing some saved cards will be retried." : cards.length ? " Saved cards were removed." : "",
  ].join("");
}

export async function extendDeadline(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { message: "That campaign doesn't exist." };
  const parsed = parseExtendDeadlineForm(form);
  if (!parsed.ok) return { message: parsed.message };
  const { error } = await supabase.rpc("admin_extend_deadline", { p_id: id.data, p: parsed.payload });
  if (error) return { message: adminErrorMessage(error) };
  return done("Deadline extended. The campaign is open for reservations again.");
}

// ---- Inventory ---------------------------------------------------------------------------

export async function setSlotBlock(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const slot = uuid.safeParse(form.get("slot_id"));
  const block = form.get("block") === "true";
  if (!slot.success) return { message: "That space doesn't exist." };
  const why = block ? reason(500).safeParse(form.get("reason")) : null;
  if (why && !why.success) return { message: why.error.issues[0].message };
  const { data, error } = await supabase.rpc("admin_set_slot_block", { p_slot_id: slot.data, p_block: block, p_reason: why?.data });
  if (error) return { message: adminErrorMessage(error) };
  return done(data === "already" ? "Already done: nothing changed." : block ? "Space blocked." : "Space unblocked.");
}

// ---- Reservations ------------------------------------------------------------------------

export async function cancelBooking(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const booking = uuid.safeParse(form.get("booking_id"));
  const why = reason(500).safeParse(form.get("reason"));
  if (!booking.success) return { message: "That reservation doesn't exist." };
  if (!why.success) return { message: why.error.issues[0].message };
  const { data, error } = await supabase.rpc("admin_cancel_booking", { p_booking_id: booking.data, p_reason: why.data });
  if (error) return { message: adminErrorMessage(error) };
  if (data === "already") return done("Already canceled: nothing changed.");
  const followUp = await afterCancel(booking.data);
  return done(`Canceled. Its spaces are available again.${followUp}`);
}

// Tells the customer and removes their saved card (secret-key client, only after requireAdmin()
// and a successful admin_cancel_booking). Failures are retried by the email-outbox cron.
async function afterCancel(bookingId: string) {
  const admin = createAdminClient();
  const [emails, card] = await Promise.all([
    processOutboxForBooking(admin, bookingId).catch((): string[] => []),
    (async () => removeSavedCard(admin, getStripe(), bookingId))().catch(() => "failed" as const),
  ]);
  const notes = [
    emails.includes("sent") ? " The customer was emailed." : emails.includes("failed") ? " The email will be retried." : "",
    card === "removed" ? " Their saved card was removed." : card === "failed" ? " Removing their saved card will be retried." : "",
  ];
  return notes.join("");
}

export async function addBookingNote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const booking = uuid.safeParse(form.get("booking_id"));
  const body = z.string().trim().min(1, "Write a note first.").max(2000).safeParse(form.get("body"));
  if (!booking.success) return { message: "That reservation doesn't exist." };
  if (!body.success) return { message: body.error.issues[0].message };
  const { error } = await supabase.rpc("admin_add_booking_note", { p_booking_id: booking.data, p_body: body.data });
  if (error) return { message: adminErrorMessage(error) };
  return done("Note added.");
}

export async function flagBooking(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const booking = uuid.safeParse(form.get("booking_id"));
  if (!booking.success) return { message: "That reservation doesn't exist." };
  const clear = form.get("clear") === "true";
  const why = clear ? null : reason(500).safeParse(form.get("reason"));
  if (why && !why.success) return { message: why.error.issues[0].message };
  const { error } = await supabase.rpc("admin_flag_booking", { p_booking_id: booking.data, p_reason: why?.data ?? null });
  if (error) return { message: adminErrorMessage(error) };
  return done(clear ? "Flag cleared." : "Flagged for investigation.");
}

// ---- Artwork -----------------------------------------------------------------------------

export async function reviewArtwork(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const artwork = uuid.safeParse(form.get("artwork_id"));
  const decision = z.enum(["approved", "rejected", "changes_requested"]).safeParse(form.get("decision"));
  if (!artwork.success || !decision.success) return { message: "That review isn't possible." };
  const note = String(form.get("note") ?? form.get("reason") ?? "").trim();
  if (decision.data !== "approved" && !note) return { message: "Please give a reason the advertiser can act on." };
  const { data, error } = await supabase.rpc("admin_review_artwork", { p_artwork_id: artwork.data, p_decision: decision.data, p_note: note || undefined });
  if (error) return { message: adminErrorMessage(error) };
  const words = { approved: "Content approved.", rejected: "Rejected.", changes_requested: "Changes requested." };
  return done(data === "already" ? "Already recorded: nothing changed." : words[decision.data]);
}

// ---- Mailing evidence --------------------------------------------------------------------

const EVIDENCE_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "application/pdf": { ext: "pdf", magic: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
};
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const BUCKET = "mailing-evidence";

export type EvidenceTicket = { ok: true; path: string; uploadUrl: string } | { ok: false; message: string };

// Step 1: a one-time signed upload URL into the PRIVATE bucket (the browser uploads straight to
// storage; files never pass through this server, which also avoids request-size limits).
export async function startEvidenceUpload(input: { editionId: string; contentType: string; size: number }): Promise<EvidenceTicket> {
  await requireAdmin();
  const edition = uuid.safeParse(input.editionId);
  const type = EVIDENCE_TYPES[input.contentType];
  if (!edition.success) return { ok: false, message: "That campaign doesn't exist." };
  if (!type) return { ok: false, message: "Upload a PDF, JPG or PNG file." };
  if (!(input.size > 0 && input.size <= MAX_EVIDENCE_BYTES)) return { ok: false, message: "Files can be up to 10 MB." };
  const path = `${edition.data}/${randomUUID()}.${type.ext}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "The upload couldn't be started. Nothing was saved." };
  return { ok: true, path, uploadUrl: data.signedUrl };
}

const EvidenceInput = z.object({
  edition_id: z.uuid(),
  kind: z.enum(["printer_confirmation", "final_proof", "postal_acceptance", "mailing_confirmation", "other"]),
  title: z.string().trim().min(1, "Give the document a title.").max(200),
  storage_path: z.string().trim(),
  quantity_printed: z.string().trim().transform((v) => (v === "" ? null : Number(v))).pipe(z.number().int().min(0).nullable()),
  quantity_accepted: z.string().trim().transform((v) => (v === "" ? null : Number(v))).pipe(z.number().int().min(0).nullable()),
  event_date: z.string().trim().transform((v) => (v === "" ? null : v)).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  notes: z.string().trim().max(2000),
});

// Step 2: verify the stored file (its real type from its first bytes, its size, its folder) and
// record the evidence as the signed-in admin. A file that fails is deleted, never recorded.
export async function uploadEvidence(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const input = EvidenceInput.safeParse(
    Object.fromEntries(["edition_id", "kind", "title", "storage_path", "quantity_printed", "quantity_accepted", "event_date", "notes"].map((k) => [k, String(form.get(k) ?? "")])),
  );
  if (!input.success) return { message: input.error.issues[0].message.startsWith("Invalid") ? "Some details are missing or invalid." : input.error.issues[0].message };
  const { edition_id, storage_path } = input.data;

  let stored: { type: string; size: number } | null = null;
  if (storage_path) {
    const storage = createAdminClient().storage.from(BUCKET);
    const discard = async (message: string) => {
      await storage.remove([storage_path]);
      return { message };
    };
    if (!new RegExp(`^${edition_id}/[0-9a-f-]{36}\\.(pdf|jpg|png)$`).test(storage_path)) return { message: "That upload doesn't belong to this campaign." };
    const { data: blob, error } = await storage.download(storage_path);
    if (error || !blob) return { message: "The uploaded file wasn't found. Please upload it again." };
    if (blob.size > MAX_EVIDENCE_BYTES) return discard("Files can be up to 10 MB.");
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const type = Object.entries(EVIDENCE_TYPES).find(([, t]) => t.magic(head));
    if (!type || !storage_path.endsWith(`.${type[1].ext}`)) return discard("Upload a PDF, JPG or PNG file.");
    stored = { type: type[0], size: blob.size };
  }

  const { error } = await supabase.rpc("admin_add_evidence", {
    p_edition_id: edition_id,
    p: {
      kind: input.data.kind,
      title: input.data.title,
      storage_path: storage_path || null,
      content_type: stored?.type ?? null,
      byte_size: stored?.size ?? null,
      quantity_printed: input.data.quantity_printed,
      quantity_accepted: input.data.quantity_accepted,
      event_date: input.data.event_date,
      notes: input.data.notes,
    },
  });
  if (error) {
    if (storage_path) await createAdminClient().storage.from(BUCKET).remove([storage_path]);
    return { message: adminErrorMessage(error) };
  }
  return done("Evidence saved (not published).");
}

export async function publishEvidence(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const id = uuid.safeParse(form.get("evidence_id"));
  if (!id.success) return { message: "That evidence doesn't exist." };
  const publish = form.get("publish") === "true";
  const { data, error } = await supabase.rpc("admin_publish_evidence", { p_id: id.data, p_publish: publish });
  if (error) return { message: adminErrorMessage(error) };
  return done(data === "already" ? "Already done: nothing changed." : publish ? "Published." : "Unpublished.");
}
