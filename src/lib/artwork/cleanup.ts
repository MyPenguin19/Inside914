import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Only the database can claim stale, never-committed uploads. Retained originals are not garbage.
// A failed Storage removal keeps the claim for the next run; activation cannot race the deletion.
export async function cleanupAbandonedArtwork(admin: SupabaseClient<Database>) {
  const claimed = await admin.rpc("claim_abandoned_artwork");
  if (claimed.error) throw claimed.error;
  let removed = 0;
  for (const upload of claimed.data) {
    const files = [{ bucket: upload.bucket, path: upload.storage_path },
      ...(upload.original_path ? [{ bucket: "house-artwork-originals", path: upload.original_path }] : [])];
    let complete = true;
    for (const file of files) {
      const result = await admin.storage.from(file.bucket).remove([file.path]);
      if (result.error) complete = false;
    }
    if (complete) {
      const deleted = await admin.from("artwork_uploads").delete().eq("id", upload.id).eq("status", "deleting");
      if (!deleted.error) removed++;
    }
  }
  return { claimed: claimed.data.length, removed };
}
