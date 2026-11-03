import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

import { getBookableSquareCatalogs, getEditionCatalog } from "@/lib/catalog/queries";

import { findRegion } from "@/lib/catalog/regions";
import { createCart } from "./cart";

type Admin = SupabaseClient<Database>;
export const ZoneSelection = z.object({ selections: z.array(z.object({ editionId: z.uuid(), slotId: z.uuid() })).min(1).max(4).refine(items => new Set(items.map(i => i.editionId)).size === items.length) });
export async function categoryCatalog() {
  const editions = await getBookableSquareCatalogs();
  return { editions: editions.filter(e => findRegion(e.zoneSlug)) };
}
export async function createCategoryCart(admin: Admin, raw: unknown) {
  const input = ZoneSelection.parse(raw);
  const catalogs = await Promise.all(input.selections.map(i => getEditionCatalog(i.editionId)));
  const zones = new Set<string>();
  const items = catalogs.map((c, index) => {
    if (!c || !c.bookable || c.productModel !== "square_v1" || !findRegion(c.zoneSlug) || zones.has(c.zoneSlug)) throw new Error("Choose one available campaign per area.");
    zones.add(c.zoneSlug);
    const slot = c.slots.find(s => s.id === input.selections[index].slotId && s.available);
    if (!slot) throw new Error("A selected position is no longer available. Choose another position; nothing was held.");
    return { editionId: c.id, slotIds: [slot.id], mode: "standard" };
  });
  // The database atomically locks every requested position; never substitute a position.
  return createCart(admin, items);
}
