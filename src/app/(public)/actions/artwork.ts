"use server";

import { cookies } from "next/headers";
import {
  extendHold,
  finalizeUpload,
  removeArtwork as removeArtworkFor,
  requestUpload,
  saveLayout,
  type ArtworkFailure,
  type ArtworkView,
  type ExtendFailure,
} from "@/lib/artwork/service";
import { CART_COOKIE, ownedCart } from "@/lib/booking/cart";
import { getHeldBooking } from "@/lib/booking/held-booking";
import { shareCartArtwork } from "@/lib/booking/category-checkout";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import { createAdminClient } from "@/lib/supabase/admin";

// Thin wrappers: read the hold cookie, run the service, and never leak internal errors.

async function holdToken() {
  const jar = await cookies();
  const token = jar.get(HOLD_COOKIE)?.value;
  const admin = createAdminClient();
  const held = token ? await getHeldBooking(admin,token) : null;
  if (held?.productModel === "square_v1") {
    const cart = await ownedCart(admin,jar.get(CART_COOKIE)?.value);
    if (!cart || cart.members[0].id !== held.id || cart.members.some(b=>b.status!=="pending" || !b.holdExpiresAt || Date.parse(b.holdExpiresAt)<=Date.now())) return undefined;
  }
  return token;
}

async function guarded<T>(label: string, run: () => Promise<T>): Promise<T | { ok: false; reason: "error" }> {
  try {
    return await run();
  } catch (error) {
    console.error(`${label} failed`, error);
    return { ok: false, reason: "error" };
  }
}

export type UploadTicket = { ok: true; artworkId: string; uploadUrl: string } | { ok: false; reason: ArtworkFailure };
export type FinalizeResult = { ok: true; artwork: ArtworkView } | { ok: false; reason: ArtworkFailure };
export type SimpleResult = { ok: true } | { ok: false; reason: ArtworkFailure };
export type ExtendResult = { ok: true; expiresAt: string } | { ok: false; reason: ExtendFailure };

export async function requestArtworkUpload(input: { byteSize: number }): Promise<UploadTicket> {
  return guarded("requestArtworkUpload", async () => requestUpload(createAdminClient(), await holdToken(), input));
}

export async function finalizeArtworkUpload(input: { artworkId: string }): Promise<FinalizeResult> {
  return guarded("finalizeArtworkUpload", async () => finalizeUpload(createAdminClient(), await holdToken(), input));
}

export async function saveArtworkLayout(input: {
  artworkId: string;
  crop: { x: number; y: number; width: number; height: number };
  zoom: number;
}): Promise<SimpleResult> {
  return guarded("saveArtworkLayout", async () => {
    const admin = createAdminClient();
    const token = await holdToken();
    const result = await saveLayout(admin,token,input);
    if (result.ok && token && (await getHeldBooking(admin,token))?.productModel === "square_v1") {
      await shareCartArtwork(admin,(await cookies()).get(CART_COOKIE)?.value);
    }
    return result;
  });
}

export async function removeArtwork(): Promise<SimpleResult> {
  return guarded("removeArtwork", async () => removeArtworkFor(createAdminClient(), await holdToken()));
}

export async function extendCurrentHold(): Promise<ExtendResult> {
  return guarded("extendCurrentHold", async () => extendHold(createAdminClient(), await holdToken()));
}
