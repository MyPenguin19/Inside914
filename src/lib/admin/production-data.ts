import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadHouseArtwork } from "@/lib/print/house-artwork";

// Only called after requireAdmin. Shared within one server render, never across
// requests. Mutating actions still perform their own fresh authorization/checks.
export const getCampaignProduction = cache(async (db: SupabaseClient<Database>, id: string) => {
  const [mail, collection, ledger, houseBytes] = await Promise.all([
    db.rpc("admin_mail_readiness", { p_id: id }),
    db.rpc("admin_collection_preview", { p_id: id }),
    db.from("zone_charges").select("id,booking_id,status,amount_cents,failure_code,recovery_expires_at").eq("edition_id", id).order("created_at"),
    loadHouseArtwork(db),
  ]);
  return { mail, collection, ledger, houseBytes };
});
