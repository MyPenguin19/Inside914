import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ARTWORK_BUCKET } from "@/lib/artwork/service";
import { validateImage } from "@/lib/artwork/validate-image";
import { MAX_UPLOAD_BYTES } from "@/lib/artwork/rules";
import { canEditReservation } from "./auth";
type Admin = SupabaseClient<Database>;
// Called only after server Auth verification; also checks the immutable ownership link.
export async function editable(
  admin: Admin,
  userId: string,
  bookingId: string,
) {
  const link = await admin
    .from("advertiser_bookings")
    .select("booking_id")
    .eq("user_id", userId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (link.error || !link.data) throw new Error("Reservation unavailable");
  const { data: b, error } = await admin
    .from("bookings")
    .select("status,editions(status,artwork_due_at,artwork_deadline)")
    .eq("id", bookingId)
    .single();
  if (error || !b.editions || !canEditReservation(b, b.editions))
    throw new Error("Artwork changes are closed");
}
export async function beginDraft(
  admin: Admin,
  userId: string,
  bookingId: string,
  raw: unknown,
) {
  const input = z
    .object({ byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES) })
    .parse(raw);
  await editable(admin, userId, bookingId);
  const old = await admin
    .from("booking_artwork")
    .select("updated_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (old.error) throw old.error;
  const id = randomUUID(),
    path = `${bookingId}/revisions/${id}`;
  const saved = await admin
    .from("advertiser_artwork_drafts")
    .insert({
      id,
      booking_id: bookingId,
      user_id: userId,
      storage_path: path,
      base_updated_at: old.data?.updated_at ?? null,
      byte_size: input.byteSize,
    });
  if (saved.error) throw saved.error;
  const signed = await admin.storage
    .from(ARTWORK_BUCKET)
    .createSignedUploadUrl(path);
  if (signed.error) throw signed.error;
  return { ok: true as const, artworkId: id, uploadUrl: signed.data.signedUrl };
}
export async function finalizeDraft(
  admin: Admin,
  userId: string,
  bookingId: string,
  raw: unknown,
) {
  const { artworkId } = z.object({ artworkId: z.uuid() }).parse(raw);
  await editable(admin, userId, bookingId);
  const { data: d, error } = await admin
    .from("advertiser_artwork_drafts")
    .select("*")
    .eq("id", artworkId)
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .eq("status", "uploading")
    .single();
  if (error || !d) throw new Error("Upload unavailable");
  const file = await admin.storage
    .from(ARTWORK_BUCKET)
    .download(d.storage_path);
  if (file.error || !file.data)
    return { ok: false as const, reason: "upload_missing" as const };
  const check = await validateImage(Buffer.from(await file.data.arrayBuffer()));
  if (!check.ok) return check;
  const updated = await admin
    .from("advertiser_artwork_drafts")
    .update({
      status: "ready",
      content_type: check.contentType,
      width_px: check.width,
      height_px: check.height,
      byte_size: check.byteSize,
    })
    .eq("id", d.id)
    .eq("status", "uploading");
  if (updated.error) throw updated.error;
  const signed = await admin.storage
    .from(ARTWORK_BUCKET)
    .createSignedUrl(d.storage_path, 600);
  if (signed.error) throw signed.error;
  return {
    ok: true as const,
    artwork: {
      id: d.id,
      contentType: check.contentType,
      width: check.width,
      height: check.height,
      viewUrl: signed.data.signedUrl,
      crop: null,
      zoom: null,
    },
  };
}
export const RevisionLayout = z.object({
  artworkId: z.uuid(),
  crop: z.object({
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
  zoom: z.number().min(1).max(4),
});
