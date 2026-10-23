import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createHoldToken, hashHoldToken } from "./hold-token";
import { getPricingMode } from "@/lib/pricing";
import {
  getBookingById,
  checkoutGate,
  newReference,
  stripeModeConflict,
  type ConfirmOutcome,
} from "@/lib/checkout/service";
import type { StripeClient } from "@/lib/checkout/stripe";
import { ARTWORK_BUCKET } from "@/lib/artwork/service";
import { processOutboxForBooking } from "@/lib/email/outbox";

type Admin = SupabaseClient<Database>;
export const CART_COOKIE = "inside914_cart";
export const CART_TERMS = "square-zones-v1";
export const cartMemberToken = (token: string, edition: string) =>
  createHmac("sha256", token)
    .update(`inside914-area:${edition}`)
    .digest("base64url");
export const CartSelection = z
  .array(
    z.object({
      editionId: z.uuid(),
      slotIds: z.array(z.uuid()).min(1).max(256),
      mode: z.enum(["standard", "double", "full_side", "both_sides"]),
    }),
  )
  .min(1)
  .max(4);

export async function createCart(admin: Admin, raw: unknown) {
  const items = CartSelection.parse(raw);
  const { token, hash } = createHoldToken();
  const { data, error } = await admin.rpc("hold_cart", {
    p_token_hash: hash,
    p_pricing_mode: getPricingMode(),
    p_items: items.map((i) => ({
      edition_id: i.editionId,
      slot_ids: i.slotIds,
      mode: i.mode,
      token_hash: hashHoldToken(cartMemberToken(token, i.editionId)),
    })),
  });
  if (error) console.error("hold_cart failed", error.code, error.message);
  if (error)
    throw new Error(
      error.code.startsWith("INS")
        ? "An area is no longer available. Please review your selections; nothing was held."
        : "Could not hold these areas.",
    );
  return { id: data, token };
}
export async function cartById(admin: Admin, id: string) {
  const { data, error } = await admin
    .from("bookings")
    .select("id")
    .eq("cart_id", id)
    .order("id");
  if (error) throw error;
  const members = await Promise.all(
    (data ?? []).map((b) => getBookingById(admin, b.id)),
  );
  return members.filter((b): b is NonNullable<typeof b> => !!b);
}
export async function ownedCart(admin: Admin, token: string | undefined) {
  if (!token) return null;
  const { data, error } = await admin
    .from("reservation_carts")
    .select("id")
    .eq("token_hash", hashHoldToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const members = await cartById(admin, data.id);
  return members.length ? { id: data.id, members } : null;
}
export function cartExpired(members: Awaited<ReturnType<typeof cartById>>) {
  return members.some(
    (b) =>
      b.status !== "reserved" &&
      (b.status !== "pending" ||
        !b.holdExpiresAt ||
        Date.parse(b.holdExpiresAt) <= Date.now()),
  );
}
export function cartGate(
  members: Awaited<ReturnType<typeof cartById>>,
  contact = false,
) {
  if (!members.length || members.length > 4) return "no_hold";
  return members.map((b) => checkoutGate(b, { contact })).find(Boolean) ?? null;
}
export async function startCartPayment(
  admin: Admin,
  stripe: StripeClient,
  token: string | undefined,
) {
  const cart = await ownedCart(admin, token);
  if (!cart) return { ok: false as const, reason: "no_hold" };
  const gate = cartGate(cart.members, true);
  if (gate) return { ok: false as const, reason: gate };
  const b = cart.members[0];
  const conflict = stripeModeConflict(b, stripe);
  if (conflict) return { ok: false as const, reason: conflict };
  const customer =
    b.stripeCustomerId ??
    (
      await stripe.customers.create(
        {
          email: b.contact!.email,
          name: b.contact!.business_name,
          metadata: { cart_id: cart.id },
        },
        { idempotencyKey: `inside914-cart-customer-${cart.id}` },
      )
    ).id;
  const saved = await admin
    .from("bookings")
    .update({ stripe_customer_id: customer })
    .eq("cart_id", cart.id)
    .eq("status", "pending");
  if (saved.error) throw saved.error;
  let intent = b.stripeSetupIntentId
    ? await stripe.setupIntents.retrieve(b.stripeSetupIntentId)
    : null;
  if (!intent || intent.status === "canceled") {
    intent = await stripe.setupIntents.create(
      {
        customer,
        usage: "off_session",
        allowed_payment_method_types: ["card"],
        metadata: {
          booking_id: b.id,
          cart_id: cart.id,
          amount_cents: String(
            cart.members.reduce((n, m) => n + m.priceCents, 0),
          ),
        },
      },
      {
        idempotencyKey: `inside914-cart-seti-${cart.id}-${b.stripeSetupIntentId ?? "first"}`,
      },
    );
    const savedIntent = await admin
      .from("bookings")
      .update({ stripe_setup_intent_id: intent.id })
      .eq("id", b.id)
      .eq("status", "pending");
    if (savedIntent.error) throw savedIntent.error;
  }
  return {
    ok: true as const,
    clientSecret: intent.client_secret!,
    status: intent.status,
  };
}
export async function completeCart(
  admin: Admin,
  stripe: StripeClient,
  id: string,
): Promise<ConfirmOutcome> {
  const members = await cartById(admin, id);
  const leader = members.find((b) => b.stripeSetupIntentId);
  if (!leader) return "not_pending";
  const conflict = stripeModeConflict(leader, stripe);
  if (conflict) return conflict;
  const intent = await stripe.setupIntents.retrieve(
    leader.stripeSetupIntentId!,
  );
  if (intent.status !== "succeeded") return "setup_not_succeeded";
  const customer =
    typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
  const pm =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method?.id;
  if (
    !pm ||
    intent.metadata?.cart_id !== id ||
    intent.metadata?.booking_id !== leader.id ||
    customer !== leader.stripeCustomerId ||
    intent.metadata?.amount_cents !==
      String(members.reduce((n, b) => n + b.priceCents, 0))
  )
    return "setup_mismatch";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin.rpc("confirm_cart", {
      p_cart_id: id,
      p_setup_intent_id: intent.id,
      p_payment_method_id: pm,
      p_references: Object.fromEntries(
        members.map((b) => [b.id, newReference()]),
      ),
    });
    if (error?.code === "23505" && error.message.includes("reference"))
      continue;
    if (error) throw error;
    if (data === "confirmed" || data === "already_confirmed") {
      await Promise.all(
        members.map((b) =>
          processOutboxForBooking(admin, b.id).catch(() => {}),
        ),
      );
    }
    // Failed, terminal groups cannot later confirm with a detached card. Release all
    // pending members first, then retain the card only if a confirmed member needs it.
    if (
      [
        "hold_expired",
        "not_pending",
        "inventory_lost",
        "edition_closed",
      ].includes(data)
    ) {
      const released = await admin
        .from("bookings")
        .update({ status: "released" })
        .eq("cart_id", id)
        .eq("status", "pending");
      if (released.error) throw released.error;
      const active = await admin
        .from("bookings")
        .select("id")
        .eq("stripe_payment_method_id", pm)
        .not("status", "in", "(cancelled,released)")
        .limit(1);
      if (active.error) throw active.error;
      if (!active.data?.length)
        await stripe.paymentMethods.detach(pm).catch(() => {});
    }
    return data as ConfirmOutcome;
  }
  throw new Error("Could not allocate reservation references");
}
// Copies are independent objects: replacing one area's image cannot remove another area's art.
// Always require positioning in the existing editor, including when the product dimensions differ.
export async function copyCartArtwork(
  admin: Admin,
  token: string | undefined,
  sourceId: string,
  targetId: string,
) {
  const cart = await ownedCart(admin, token);
  if (
    !cart ||
    sourceId === targetId ||
    !cart.members.some((b) => b.id === sourceId) ||
    !cart.members.some((b) => b.id === targetId) ||
    cart.members.some(
      (b) =>
        b.status !== "pending" ||
        !b.holdExpiresAt ||
        Date.parse(b.holdExpiresAt) <= Date.now(),
    )
  )
    throw new Error("This hold is unavailable.");
  const { data: source, error } = await admin
    .from("booking_artwork")
    .select("*")
    .eq("booking_id", sourceId)
    .eq("status", "ready")
    .single();
  if (error || !source) throw new Error("Upload the source artwork first.");
  const path = `${targetId}/${randomUUID()}`;
  const copied = await admin.storage
    .from(ARTWORK_BUCKET)
    .copy(source.storage_path, path);
  if (copied.error) throw new Error("Could not copy artwork.");
  const { data: old, error: oldError } = await admin
    .from("booking_artwork")
    .select("storage_path")
    .eq("booking_id", targetId)
    .maybeSingle();
  if (oldError) {
    await admin.storage.from(ARTWORK_BUCKET).remove([path]);
    throw oldError;
  }
  const saved = await admin.from("booking_artwork").upsert(
    {
      booking_id: targetId,
      storage_path: path,
      status: "ready",
      content_type: source.content_type,
      byte_size: source.byte_size,
      width_px: source.width_px,
      height_px: source.height_px,
      crop_x: null,
      crop_y: null,
      crop_width: null,
      crop_height: null,
      zoom: null,
      review_status: "pending",
      shared_source_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id" },
  );
  if (saved.error) {
    await admin.storage.from(ARTWORK_BUCKET).remove([path]);
    throw saved.error;
  }
  if (old) await admin.storage.from(ARTWORK_BUCKET).remove([old.storage_path]);
}
