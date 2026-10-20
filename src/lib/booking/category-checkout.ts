import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

import { getBookableEditions, getEditionCatalog } from "@/lib/catalog/queries";

import { findRegion } from "@/lib/catalog/regions";
import { hashHoldToken } from "./hold-token";
import { createCart, ownedCart } from "./cart";
import { ARTWORK_BUCKET } from "@/lib/artwork/service";

type Admin = SupabaseClient<Database>;
export const ZoneSelection = z.object({ selections: z.array(z.object({ editionId: z.uuid(), slotId: z.uuid() })).min(1).max(4).refine(items => new Set(items.map(i => i.editionId)).size === items.length) });
export async function categoryCatalog() {
  const editions = (await getBookableEditions()).filter(e => e.bookable && e.productModel === "square_v1" && findRegion(e.zoneSlug));
  const catalogs = await Promise.all(editions.map(e => getEditionCatalog(e.id)));
  return { editions: catalogs.filter((e): e is NonNullable<typeof e> => !!e && e.bookable) };
}
export async function createCategoryCart(admin: Admin, raw: unknown) {
  const input = ZoneSelection.parse(raw);
  const catalogs = await Promise.all(input.selections.map(i => getEditionCatalog(i.editionId)));
  const zones = new Set<string>();
  const items = catalogs.map((c, index) => {
    if (!c || !c.bookable || c.productModel !== "square_v1" || !findRegion(c.zoneSlug) || zones.has(c.zoneSlug)) throw new Error("Choose one available campaign per area.");
    zones.add(c.zoneSlug);
    const slot = c.slots.find(s => s.id === input.selections[index].slotId && s.available);
    if (!slot) throw new Error("A selected square is no longer available. Choose another square; nothing was held.");
    return { editionId: c.id, slotIds: [slot.id], mode: "standard" };
  });
  // The database atomically locks every requested square; never substitute a position.
  return createCart(admin, items);
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
