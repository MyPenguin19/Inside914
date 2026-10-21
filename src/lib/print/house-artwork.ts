import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { validHouseArtwork } from "./export";

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
