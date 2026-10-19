import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPricingMode } from "@/lib/pricing";
import { getBookableEditions, getEditionCatalog } from "@/lib/catalog/queries";
import { createPublicClient } from "@/lib/supabase/public";
import { findRegion } from "@/lib/catalog/regions";
import { createHoldToken, hashHoldToken } from "./hold-token";
import { cartMemberToken, ownedCart } from "./cart";
import { ARTWORK_BUCKET } from "@/lib/artwork/service";

type Admin = SupabaseClient<Database>;
export const ZoneSelection = z.object({ categoryId: z.string().regex(/^[a-z0-9-]{1,60}$/), editionIds: z.array(z.uuid()).min(1).max(4).refine(ids => new Set(ids).size === ids.length) });
export async function categoryCatalog() {
  const db = createPublicClient();
  const [editions, categories, availability] = await Promise.all([
    getBookableEditions(), db.from("advertising_categories").select("id,name").order("name"),
    db.from("category_availability").select("edition_id,category_id,occupancy"),
  ]);
  if (categories.error || availability.error) throw new Error("Could not load category availability.");
  return { editions: editions.filter(e => e.productModel === "square_v1" && findRegion(e.zoneSlug)), categories: categories.data!, availability: availability.data! };
}
export async function createCategoryCart(admin: Admin, raw: unknown) {
  const input = ZoneSelection.parse(raw);
  const { token, hash } = createHoldToken();
  // Availability is advisory. The existing RPC locks categories and slots and rolls
  // the entire cart back if any selection conflicts. Retry a competing slot once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const catalogs = await Promise.all(input.editionIds.map(id => getEditionCatalog(id)));
    const zones = new Set<string>();
    const items = catalogs.map(c => {
      if (!c || !c.bookable || c.productModel !== "square_v1" || !findRegion(c.zoneSlug) || zones.has(c.zoneSlug)) throw new Error("Choose one available campaign per zone.");
      zones.add(c.zoneSlug);
      const slot = c.slots.find(s => s.available);
      if (!slot) throw new Error(`${c.zoneName} has no available positions.`);
      return { edition_id: c.id, slot_ids: [slot.id], mode: "standard", token_hash: hashHoldToken(cartMemberToken(token,c.id)) };
    });
    const { data, error } = await admin.rpc("hold_category_cart", { p_category_id: input.categoryId, p_token_hash: hash, p_items: items, p_pricing_mode: getPricingMode() });
    if (!error) return { id: data, token };
    if (error.code === "INS03" && attempt === 0) continue;
    if (error.code === "CAT05") throw new Error("Your category was just reserved in a selected zone. Review availability and choose again; nothing was held.");
    throw new Error("A selected zone or category is unavailable. Review your selection; nothing was held.");
  }
  throw new Error("Please refresh availability and try again.");
}

// One upload/crop; independent private storage copies, committed atomically to all
// members. The browser never supplies a target, file path, price or category claim.
export async function shareCartArtwork(admin: Admin, token: string | undefined) {
  const cart = await ownedCart(admin, token);
  if (!cart || !token || cart.members.some(b => b.productModel !== "square_v1" || b.status !== "pending" || !b.holdExpiresAt || Date.parse(b.holdExpiresAt)<=Date.now())) throw new Error("This hold is unavailable.");
  const { data: source, error } = await admin.from("booking_artwork").select("*").eq("booking_id",cart.members[0].id).single();
  if (error || !source || source.status !== "ready" || source.crop_width === null || source.crop_height === null || Math.abs(source.crop_width-source.crop_height)>1) throw new Error("Save one square artwork first.");
  const targets: { booking_id: string; path: string }[] = [];
  const old = await admin.from("booking_artwork").select("storage_path").in("booking_id",cart.members.slice(1).map(b=>b.id));
  if (old.error) throw old.error;
  try {
    for (const b of cart.members.slice(1)) {
      const path = `${b.id}/${randomUUID()}`;
      const copied = await admin.storage.from(ARTWORK_BUCKET).copy(source.storage_path,path);
      if (copied.error) throw new Error("Could not share artwork. Please try saving again.");
      targets.push({ booking_id: b.id, path });
    }
    const saved = await admin.rpc("share_square_cart_artwork", { p_token_hash: hashHoldToken(token), p_source_id: source.id, p_version: source.updated_at, p_targets: targets });
    if (saved.error) throw new Error("Artwork or hold changed. Please reload and save again.");
  } catch (error) {
    if (targets.length) await admin.storage.from(ARTWORK_BUCKET).remove(targets.map(t=>t.path));
    throw error;
  }
  if (old.data?.length) await admin.storage.from(ARTWORK_BUCKET).remove(old.data.map(a=>a.storage_path));
}
