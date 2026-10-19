import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerEnv } from "@/lib/env/server";
import { getPricingMode } from "@/lib/pricing";
import { getBookableEditions, getEditionCatalog } from "@/lib/catalog/queries";
import { cartMemberToken, cartById } from "@/lib/booking/cart";
import { hashHoldToken } from "@/lib/booking/hold-token";
import { selectionForSlot, priceFor } from "@/lib/booking/selection";
import type { BookingSize } from "@/lib/booking/products";
import { ARTWORK_BUCKET } from "@/lib/artwork/service";
import { scheduledMonths } from "./schedule";
type Admin = SupabaseClient<Database>;
export type Plan = Database["public"]["Tables"]["recurring_plans"]["Row"];
export const occurrenceToken = (nonce: string) =>
  createHmac("sha256", getServerEnv().SUPABASE_SECRET_KEY)
    .update(`recurring-v1:${nonce}`)
    .digest("base64url");
export async function ownedPlan(db: Admin, userId: string, id: string) {
  const { data, error } = await db
    .from("recurring_plans")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Plan unavailable.");
  return data;
}
export async function reviewOccurrence(
  db: Admin,
  userId: string,
  id: string,
  month: string,
) {
  const plan = await ownedPlan(db, userId, id);
  if (
    plan.status !== "active" ||
    !scheduledMonths(plan).includes(month) ||
    month.slice(0, 7) < new Date().toISOString().slice(0, 7)
  )
    throw new Error("This month is not active in your schedule.");
  const editions = await getBookableEditions();
  const items = [];
  for (const sourceId of plan.source_booking_ids) {
    const { data: link } = await db
      .from("advertiser_bookings")
      .select("booking_id")
      .eq("booking_id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!link) throw new Error("Source reservation unavailable.");
    const { data: source } = await db
      .from("bookings")
      .select(
        "id,size,editions(zone_id,zones(slug,name)),booking_slots(slots(label,side))",
      )
      .eq("id", sourceId)
      .single();
    if (!source?.editions?.zones)
      throw new Error("Source reservation unavailable.");
    const area = source.editions.zones;
    const candidates = editions.filter(
      (e) => e.zoneSlug === area.slug && e.issueMonth === month,
    );
    if (candidates.length !== 1)
      throw new Error(
        `${area.name}: no single open campaign for this month. Check back when it opens.`,
      );
    const catalog = await getEditionCatalog(candidates[0].id);
    const original = source.booking_slots
      .map((s) => s.slots)
      .filter((s) => s !== null);
    const mode = source.size as BookingSize;
    const matching =
      catalog?.slots.filter((s) =>
        original.some((o) => o.label === s.label && o.side === s.side),
      ) ?? [];
    const selection =
      catalog && matching[0]
        ? selectionForSlot(matching[0].id, mode, catalog.slots, catalog.pairs)
        : null;
    if (
      !catalog ||
      !selection ||
      (mode !== "both_sides" &&
        mode !== "full_side" &&
        (selection.length !== matching.length ||
          selection.some((id) => !matching.some((s) => s.id === id))))
    )
      throw new Error(
        `${area.name}: the original position is unavailable. Choose a different reservation through Reserve more areas, or try again later.`,
      );
    const price = priceFor(mode, catalog);
    if (price === null)
      throw new Error(`${area.name}: this ad size is unavailable.`);
    items.push({
      sourceId,
      editionId: catalog.id,
      slotIds: selection,
      mode,
      zoneName: area.name,
      priceCents: price,
      pricingMode: catalog.pricingMode,
      positions: catalog.slots
        .filter((s) => selection.includes(s.id))
        .map((s) => `${s.side} ${s.label}`)
        .join(", "),
    });
  }
  return {
    plan,
    items,
    total: items.reduce((sum, i) => sum + i.priceCents, 0),
  };
}
// Each occurrence enters ordinary checkout with fresh contact/card/consent verification.
export async function beginOccurrence(
  db: Admin,
  userId: string,
  id: string,
  month: string,
  expectedTotal: number,
) {
  const review = await reviewOccurrence(db, userId, id, month);
  if (review.total !== expectedTotal)
    throw new Error("Pricing changed. Reload and review the current total.");
  const nonce = randomUUID();
  const token = occurrenceToken(nonce);
  const { data, error } = await db.rpc("hold_recurring_occurrence", {
    p_user: userId,
    p_plan: id,
    p_month: month,
    p_nonce: nonce,
    p_hash: hashHoldToken(token),
    p_pricing_mode: getPricingMode(),
    p_expected_total: expectedTotal,
    p_items: review.items.map((i) => ({
      source_id: i.sourceId,
      edition_id: i.editionId,
      slot_ids: i.slotIds,
      mode: i.mode,
      token_hash: hashHoldToken(cartMemberToken(token, i.editionId)),
    })),
  });
  if (error)
    throw new Error(
      error.message.includes("already reserved")
        ? "This occurrence was already reserved."
        : "Could not hold this occurrence. Refresh to check availability or plan status.",
    );
  const result = z
    .object({ cart_id: z.uuid(), nonce: z.uuid(), created: z.boolean() })
    .parse(data);
  if (result.created) {
    const members = await cartById(db, result.cart_id);
    for (const item of review.items) {
      const target = members.find((b) => b.editionId === item.editionId)!;
      const { data: art } = await db
        .from("booking_artwork")
        .select("*")
        .eq("booking_id", item.sourceId)
        .eq("status", "ready")
        .maybeSingle();
      if (!art) continue;
      const path = `${target.id}/${randomUUID()}`;
      const copy = await db.storage
        .from(ARTWORK_BUCKET)
        .copy(art.storage_path, path);
      if (copy.error) continue; // Checkout clearly requires an upload when the original is unavailable.
      const saved = await db
        .from("booking_artwork")
        .insert({
          booking_id: target.id,
          storage_path: path,
          status: "ready",
          content_type: art.content_type,
          byte_size: art.byte_size,
          width_px: art.width_px,
          height_px: art.height_px,
          review_status: "pending",
        });
      if (saved.error) await db.storage.from(ARTWORK_BUCKET).remove([path]);
      // Crop and approval are intentionally not copied: the advertiser must review every area.
    }
  }
  return { id: result.cart_id, token: occurrenceToken(result.nonce) };
}

export function isPendingOccurrence(
  members: Awaited<ReturnType<typeof cartById>>,
) {
  return (
    members.length > 0 &&
    members.every(
      (b) =>
        b.status === "pending" &&
        b.holdExpiresAt &&
        Date.parse(b.holdExpiresAt) > Date.now(),
    )
  );
}
