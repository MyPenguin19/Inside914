import "server-only";
import { acceptsCrop, isLayoutV2 } from "@/lib/print/layouts";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getHeldBooking, type HeldBooking } from "@/lib/booking/held-booking";
import { hashHoldToken } from "@/lib/booking/hold-token";
import type { Database } from "@/lib/supabase/database.types";
import { cropRemovesContent, isCropInside, MAX_UPLOAD_BYTES, type ArtworkType } from "./rules";
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
  | "too_many_pixels"
  | "unsupported_type"
  | "corrupt"
  | "too_small"
  | "upload_missing"
  | "not_found"
  | "artwork_changed"
  | "crop_approval_required"
  | "error";

export type ArtworkView = {
  id: string;
  version?: string;
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

// Never change the active booking artwork until Save commits a validated replacement.
export async function requestUpload(admin: Admin, token: string | undefined, raw: unknown) {
  const input = z.object({ byteSize: z.number().int() }).safeParse(raw);
  if (!input.success) return fail("invalid_input");
  if (input.data.byteSize <= 0) return fail("empty");
  if (input.data.byteSize > MAX_UPLOAD_BYTES) return fail("too_large");
  const hold = await activeHold(admin, token);
  if (!hold.ok) return hold;
  const current = await admin.from("booking_artwork").select("updated_at").eq("booking_id", hold.booking.id).maybeSingle();
  if (current.error) throw current.error;
  const storagePath = `${hold.booking.id}/${randomUUID()}`;
  const { data: row, error } = await admin.from("artwork_uploads").insert({
    booking_id: hold.booking.id, bucket: ARTWORK_BUCKET, storage_path: storagePath,
    base_updated_at: current.data?.updated_at ?? null,
  }).select("id").single();
  if (error) throw error;
  const { data: signed, error: signError } = await admin.storage.from(ARTWORK_BUCKET).createSignedUploadUrl(storagePath);
  if (signError) throw signError;
  return { ok: true as const, artworkId: row.id, uploadUrl: signed.signedUrl };
}

// Validation leaves a staged image. Upload success alone never replaces the saved artwork.
export async function finalizeUpload(admin: Admin, token: string | undefined, raw: unknown) {
  const input = z.object({ artworkId: z.uuid() }).safeParse(raw);
  if (!input.success) return fail("invalid_input");
  const hold = await activeHold(admin, token);
  if (!hold.ok) return hold;
  const { data: row } = await admin.from("artwork_uploads").select("*")
    .eq("id", input.data.artworkId).eq("booking_id", hold.booking.id).eq("bucket", ARTWORK_BUCKET).maybeSingle();
  if (!row || !["uploading", "ready"].includes(row.status)) return fail("not_found");
  const { data: blob, error: downloadError } = await admin.storage.from(ARTWORK_BUCKET).download(row.storage_path);
  if (downloadError || !blob) return fail("upload_missing");
  const check = await validateImage(Buffer.from(await blob.arrayBuffer()));
  if (!check.ok) return fail(check.reason); // Authenticated cleanup removes abandoned stages after URL expiry.
  const { error } = await admin.from("artwork_uploads").update({
    status: "ready", content_type: check.contentType, byte_size: check.byteSize, width_px: check.width, height_px: check.height,
  }).eq("id", row.id).in("status", ["uploading", "ready"]);
  if (error) throw error;
  const artwork = await getStagedArtwork(admin, hold.booking.id, row.id);
  return artwork ? { ok: true as const, artwork } : fail("error");
}

// Caller must already own this booking; never authorize by upload id alone.
export async function getStagedArtwork(admin: Admin, bookingId: string, uploadId: string): Promise<ArtworkView | null> {
  if (!z.uuid().safeParse(uploadId).success) return null;
  const { data: row } = await admin.from("artwork_uploads").select("*")
    .eq("id", uploadId).eq("booking_id", bookingId).eq("bucket", ARTWORK_BUCKET).eq("status", "ready").maybeSingle();
  if (!row?.width_px || !row.height_px || !row.content_type) return null;
  const { data: signed, error } = await admin.storage.from(ARTWORK_BUCKET).createSignedUrl(row.storage_path, VIEW_URL_SECONDS);
  if (error) throw error;
  return { id: row.id, version: row.storage_path, contentType: row.content_type as ArtworkType,
    width: row.width_px, height: row.height_px, viewUrl: signed.signedUrl, crop: null, zoom: null };
}

const LayoutInput = z.object({
  artworkId: z.uuid(),
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  zoom: z.number().min(1).max(10),
  cropApproved: z.boolean().default(false),
});

// Atomic database activation checks ownership, hold expiry, concurrent replacements and crop consent.
export async function saveLayout(admin: Admin, token: string | undefined, raw: unknown) {
  const input = LayoutInput.safeParse(raw);
  if (!input.success) return fail("invalid_input");
  const hold = await activeHold(admin, token);
  if (!hold.ok) return hold;
  const { data: row } = await admin.from("artwork_uploads").select("*")
    .eq("id", input.data.artworkId).eq("booking_id", hold.booking.id).eq("bucket", ARTWORK_BUCKET).maybeSingle();
  if (!row || !["ready", "retained"].includes(row.status) || !row.width_px || !row.height_px) return fail("not_found");
  const { crop, zoom, cropApproved } = input.data;
  if (!Object.values(crop).every(Number.isSafeInteger) || !isCropInside(crop, { width: row.width_px, height: row.height_px }) ||
    crop.x + crop.width > row.width_px || crop.y + crop.height > row.height_px) return fail("invalid_input");
  if (hold.booking.productModel === "square_v1" && !acceptsCrop(hold.booking.layoutTemplate, crop)) return fail("invalid_input");
  if (isLayoutV2(hold.booking.layoutTemplate) && cropRemovesContent(crop, { width: row.width_px, height: row.height_px }) && !cropApproved) return fail("crop_approval_required");
  const { error } = await admin.rpc("save_staged_artwork", {
    p_token_hash: hashHoldToken(token!), p_upload_id: row.id, p_crop: crop, p_zoom: zoom, p_crop_approved: cropApproved,
  });
  if (error) {
    if (error.code === "ART01") return fail("artwork_changed");
    if (error.code === "ART02") return fail("crop_approval_required");
    if (error.code === "INS05") return fail("no_hold");
    if (error.code === "INS06") return fail("hold_expired");
    throw error;
  }
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
  const { data: upload } = await admin.from("artwork_uploads").select("id").eq("bucket", ARTWORK_BUCKET).eq("storage_path", row.storage_path).maybeSingle();
  const hasCrop = row.crop_x !== null && row.crop_y !== null && row.crop_width !== null && row.crop_height !== null;
  return {
    id: upload?.id ?? row.id,
    version: row.storage_path,
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
  if ((await getHeldBooking(admin, token))?.cartId) return { ok: false as const, reason: "extension_limit" as ExtendFailure };
  const { data, error } = await admin.rpc("extend_hold", { p_token_hash: hashHoldToken(token) });
  if (error) {
    const reason = EXTEND_ERRORS[error.code];
    if (!reason) console.error("extend_hold failed", error.code, error.message);
    return { ok: false as const, reason: reason ?? ("error" as ExtendFailure) };
  }
  return { ok: true as const, expiresAt: data };
}
