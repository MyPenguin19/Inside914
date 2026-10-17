import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getHeldBooking, type HeldBooking } from "@/lib/booking/held-booking";
import { hashHoldToken } from "@/lib/booking/hold-token";
import type { Database } from "@/lib/supabase/database.types";
import { isCropInside, MAX_UPLOAD_BYTES, type ArtworkType } from "./rules";
import { validateImage } from "./validate-image";

// Server-side artwork operations. Every one is authorized by the browser's hold token (never by
// a booking or artwork id alone) and refuses to touch a hold that has expired.

type Admin = SupabaseClient<Database>;

export const ARTWORK_BUCKET = "artwork";
const VIEW_URL_SECONDS = 10 * 60;

export type ArtworkFailure =
  | "no_hold"
  | "hold_expired"
  | "invalid_input"
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "corrupt"
  | "too_small"
  | "upload_missing"
  | "not_found"
  | "error";

export type ArtworkView = {
  id: string;
  contentType: ArtworkType;
  width: number;
  height: number;
  viewUrl: string;
  crop: { x: number; y: number; width: number; height: number } | null;
  zoom: number | null;
};

type Fail = { ok: false; reason: ArtworkFailure };
const fail = (reason: ArtworkFailure): Fail => ({ ok: false, reason });

async function activeHold(admin: Admin, token: string | undefined): Promise<{ ok: true; booking: HeldBooking } | Fail> {
  if (!token) return fail("no_hold");
  const booking = await getHeldBooking(admin, token);
  if (!booking) return fail("no_hold");
  if (booking.state !== "active") return fail("hold_expired");
  return { ok: true, booking };
}

async function deleteArtworkFor(admin: Admin, bookingId: string) {
  const { data: rows } = await admin.from("booking_artwork").select("storage_path").eq("booking_id", bookingId);
  if (rows?.length) {
    const { error } = await admin.storage.from(ARTWORK_BUCKET).remove(rows.map((r) => r.storage_path));
    if (error) throw new Error(`Could not delete old artwork: ${error.message}`);
  }
  const { error } = await admin.from("booking_artwork").delete().eq("booking_id", bookingId);
  if (error) throw new Error(`Could not delete artwork record: ${error.message}`);
}

// Step 1: reserve a fresh random path and hand back a single-use signed upload URL for it.
// Any previous artwork for this booking is removed (this is how "Replace image" works).
export async function requestUpload(admin: Admin, token: string | undefined, raw: unknown) {
  const input = z.object({ byteSize: z.number().int() }).safeParse(raw);
  if (!input.success) return fail("invalid_input");
  if (input.data.byteSize <= 0) return fail("empty");
  if (input.data.byteSize > MAX_UPLOAD_BYTES) return fail("too_large");

  const hold = await activeHold(admin, token);
  if (!hold.ok) return hold;

  await deleteArtworkFor(admin, hold.booking.id);
  const storagePath = `${hold.booking.id}/${randomUUID()}`;
  const { data: row, error } = await admin
    .from("booking_artwork")
    .insert({ booking_id: hold.booking.id, storage_path: storagePath, status: "uploading" })
    .select("id")
    .single();
  if (error) throw new Error(`Could not start upload: ${error.message}`);

  const { data: signed, error: signError } = await admin.storage.from(ARTWORK_BUCKET).createSignedUploadUrl(storagePath);
  if (signError) throw new Error(`Could not sign upload: ${signError.message}`);
  return { ok: true as const, artworkId: row.id, uploadUrl: signed.signedUrl };
}

// Step 2: after the browser's upload, validate the stored bytes for real. Bad files are deleted.
export async function finalizeUpload(admin: Admin, token: string | undefined, raw: unknown) {
  const input = z.object({ artworkId: z.uuid() }).safeParse(raw);
  if (!input.success) return fail("invalid_input");
  const hold = await activeHold(admin, token);
  if (!hold.ok) return hold;

  const { data: row } = await admin
    .from("booking_artwork")
    .select("id, storage_path, status")
    .eq("id", input.data.artworkId)
    .eq("booking_id", hold.booking.id)
    .maybeSingle();
  if (!row || row.status !== "uploading") return fail("not_found");

  const { data: blob, error: downloadError } = await admin.storage.from(ARTWORK_BUCKET).download(row.storage_path);
  if (downloadError || !blob) {
    await admin.from("booking_artwork").delete().eq("id", row.id);
    return fail("upload_missing"); // interrupted or never sent
  }

  const check = await validateImage(Buffer.from(await blob.arrayBuffer()));
  if (!check.ok) {
    await admin.storage.from(ARTWORK_BUCKET).remove([row.storage_path]);
    await admin.from("booking_artwork").delete().eq("id", row.id);
    return fail(check.reason);
  }

  const { error } = await admin
    .from("booking_artwork")
    .update({
      status: "ready",
      content_type: check.contentType,
      byte_size: check.byteSize,
      width_px: check.width,
      height_px: check.height,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(`Could not save artwork: ${error.message}`);

  const artwork = await getArtwork(admin, hold.booking.id);
  return artwork ? { ok: true as const, artwork } : fail("error");
}

const LayoutInput = z.object({
  artworkId: z.uuid(),
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  zoom: z.number().min(1).max(10),
});

// Saves the crop rectangle (source pixels) and zoom for the booking's ready artwork.
export async function saveLayout(admin: Admin, token: string | undefined, raw: unknown) {
  const input = LayoutInput.safeParse(raw);
  if (!input.success) return fail("invalid_input");
  const hold = await activeHold(admin, token);
  if (!hold.ok) return hold;

  const { data: row } = await admin
    .from("booking_artwork")
    .select("id, width_px, height_px, status")
    .eq("id", input.data.artworkId)
    .eq("booking_id", hold.booking.id)
    .maybeSingle();
  if (!row || row.status !== "ready" || !row.width_px || !row.height_px) return fail("not_found");
  if (!isCropInside(input.data.crop, { width: row.width_px, height: row.height_px })) return fail("invalid_input");

  const { crop, zoom } = input.data;
  const { error } = await admin
    .from("booking_artwork")
    .update({
      crop_x: crop.x,
      crop_y: crop.y,
      crop_width: crop.width,
      crop_height: crop.height,
      zoom,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(`Could not save layout: ${error.message}`);
  return { ok: true as const };
}

// "Remove image": deletes the file and its record. Allowed while the hold token is still known.
export async function removeArtwork(admin: Admin, token: string | undefined) {
  if (!token) return fail("no_hold");
  const booking = await getHeldBooking(admin, token);
  if (!booking) return fail("no_hold");
  await deleteArtworkFor(admin, booking.id);
  return { ok: true as const };
}

// The booking's ready artwork with a short-lived private view URL, or null.
export async function getArtwork(admin: Admin, bookingId: string): Promise<ArtworkView | null> {
  const { data: row } = await admin
    .from("booking_artwork")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("status", "ready")
    .maybeSingle();
  if (!row || !row.width_px || !row.height_px || !row.content_type) return null;

  const { data: signed, error } = await admin.storage.from(ARTWORK_BUCKET).createSignedUrl(row.storage_path, VIEW_URL_SECONDS);
  if (error) throw new Error(`Could not sign artwork URL: ${error.message}`);
  const hasCrop = row.crop_x !== null && row.crop_y !== null && row.crop_width !== null && row.crop_height !== null;
  return {
    id: row.id,
    contentType: row.content_type as ArtworkType,
    width: row.width_px,
    height: row.height_px,
    viewUrl: signed.signedUrl,
    crop: hasCrop
      ? { x: Number(row.crop_x), y: Number(row.crop_y), width: Number(row.crop_width), height: Number(row.crop_height) }
      : null,
    zoom: row.zoom === null ? null : Number(row.zoom),
  };
}

export type ExtendFailure = "no_hold" | "hold_expired" | "extension_limit" | "extension_too_early" | "error";

const EXTEND_ERRORS: Record<string, ExtendFailure> = {
  INS05: "no_hold",
  INS06: "hold_expired",
  INS07: "extension_limit",
  INS08: "extension_too_early",
};

// "Need more time?": renews a hold in its last 5 minutes, at most twice (enforced in extend_hold()).
export async function extendHold(admin: Admin, token: string | undefined) {
  if (!token) return { ok: false as const, reason: "no_hold" as ExtendFailure };
  const { data, error } = await admin.rpc("extend_hold", { p_token_hash: hashHoldToken(token) });
  if (error) {
    const reason = EXTEND_ERRORS[error.code];
    if (!reason) console.error("extend_hold failed", error.code, error.message);
    return { ok: false as const, reason: reason ?? ("error" as ExtendFailure) };
  }
  return { ok: true as const, expiresAt: data };
}
