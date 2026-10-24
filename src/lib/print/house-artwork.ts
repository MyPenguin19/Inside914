import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { validateImage } from "@/lib/artwork/validate-image";
import type { PrintRectangle } from "./amazingmail-layout";
import type { PostcardLayout } from "./layouts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { validHouseArtwork, normalizeHouse } from "./export";

// Call only after requireAdmin. Fail closed for readiness, but allow preview fallback.
export async function loadHouseArtwork(db: SupabaseClient<Database>): Promise<Buffer | undefined> {
  try {
    const { data, error } = await db.from("house_artwork").select("storage_path").eq("singleton", true).maybeSingle();
    if (error || !data) return undefined;
    const file = await createAdminClient().storage.from("house-artwork").download(data.storage_path);
    if (file.error || !file.data) return undefined;
    return await validHouseArtwork(Buffer.from(await file.data.arrayBuffer()));
  } catch { return undefined; }
}

// Caller supplies an authenticated admin client after requireAdmin, and a server-only storage client.
// Uploaded originals and derivatives use fresh paths. Never delete on an ambiguous RPC response.
export async function saveHouseArtwork(
  storageAdmin: SupabaseClient<Database>, authorized: SupabaseClient<Database>, bytes: Buffer,
  crop: PrintRectangle, layout: PostcardLayout,
  baseUpdatedAt: string | null,
) {
  const source = await validateImage(bytes);
  if (!source.ok) throw new Error("Choose a valid PNG or JPEG image with sufficient resolution.");
  const normalized = await normalizeHouse(bytes, crop, layout);
  const id = randomUUID();
  const path = `house/${id}.png`;
  const originalPath = `house/${id}.${source.contentType === "image/png" ? "png" : "jpg"}`;
  const inserted = await storageAdmin.from("artwork_uploads").insert({
    id, bucket: "house-artwork", storage_path: path, original_path: originalPath,
    base_updated_at: baseUpdatedAt, content_type: source.contentType, byte_size: bytes.length,
    width_px: normalized.width, height_px: normalized.height,
    metadata: { source_width: source.width, source_height: source.height, crop, layout_key: layout.key,
      source_sha256: createHash("sha256").update(bytes).digest("hex") },
  });
  if (inserted.error) throw new Error("Could not prepare the upload. Please retry.");
  for (const file of [
    { bucket: "house-artwork-originals", path: originalPath, bytes, type: source.contentType },
    { bucket: "house-artwork", path, bytes: normalized.input, type: "image/png" },
  ]) {
    const uploaded = await storageAdmin.storage.from(file.bucket).upload(file.path, file.bytes, { contentType: file.type, upsert: false });
    if (uploaded.error) throw new Error("Could not store the replacement. Your saved image is unchanged. Please retry.");
    const check = await storageAdmin.storage.from(file.bucket).download(file.path);
    if (check.error || !check.data || !Buffer.from(await check.data.arrayBuffer()).equals(file.bytes)) {
      throw new Error("Could not verify the uploaded file. Your saved image is unchanged. Please retry.");
    }
  }
  const ready = await storageAdmin.from("artwork_uploads").update({ status: "ready" }).eq("id", id).eq("status", "uploading");
  if (ready.error) throw new Error("Could not verify the replacement. Please retry.");
  const saved = await authorized.rpc("admin_activate_house_artwork", { p_upload_id: id });
  if (saved.error?.code === "ART01") throw new Error("The house artwork changed in another window. Reload Settings before replacing it.");
  if (saved.error) throw new Error("Could not confirm the save. Reopen Settings before retrying; previous versions are preserved.");
  const active = await authorized.from("house_artwork").select("storage_path,updated_at").eq("singleton", true).single();
  if (active.error || active.data.storage_path !== path) throw new Error("Could not confirm the active version. Reopen Settings to check it.");
  return { ok: true as const, version: active.data.updated_at, width: normalized.width, height: normalized.height };
}
