"use server";
import { checkoutReleased, CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/release";
import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";

import { getReservationView } from "@/lib/checkout/reservation";
import { cartConsentText } from "@/lib/checkout/terms";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CART_COOKIE,
  CART_TERMS,
  cartMemberToken,
  ownedCart,
  cartGate,
  startCartPayment,
  completeCart,
  copyCartArtwork,
} from "@/lib/booking/cart";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import {
  allowHoldAttempt,
  clientAddress,
  visitorHash,
} from "@/lib/booking/hold-rate-limit";
import { getServerEnv } from "@/lib/env/server";
import { parseContact } from "@/lib/checkout/contact";
import type { ContactFormState } from "@/app/(public)/actions/checkout";
import { getStripe } from "@/lib/checkout/stripe";
import { isDevTestModeActive, isTestStripeId } from "@/lib/dev/test-mode";
import { fakeStripe } from "@/lib/dev/fake-stripe";
import { createCategoryCart, ZoneSelection } from "@/lib/booking/category-checkout";
const token = async () => (await cookies()).get(CART_COOKIE)?.value;
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 86400,
};
export async function holdAreas(raw: unknown) {
  if (!checkoutReleased()) return {ok:false as const,message:CHECKOUT_CLOSED_MESSAGE};
  try {
    const admin = createAdminClient();
    if (
      !(await allowHoldAttempt(
        admin,
        visitorHash(
          clientAddress(await headers()),
          getServerEnv().SUPABASE_SECRET_KEY,
        ),
      ))
    )
      return {
        ok: false,
        message: "Please wait a few minutes before trying again.",
      };
    const existing = await ownedCart(admin, await token());
    if (
      existing?.members.some(
        (b) =>
          b.status === "pending" &&
          b.holdExpiresAt &&
          Date.parse(b.holdExpiresAt) > Date.now(),
      )
    )
      return {
        ok: false,
        message:
          "You already have held areas. Return to your area reservation to finish or release them.",
      };
    const selection = ZoneSelection.parse(raw);
    const cart = await createCategoryCart(admin, selection);
    (await cookies()).set(CART_COOKIE, cart.token, options);
    // Open the first selected area's existing editor directly. This token is derived
    // from the successfully created cart, never from a browser-supplied credential.
    (await cookies()).set(HOLD_COOKIE, cartMemberToken(cart.token, selection.selections[0].editionId), options);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not hold these areas.",
    };
  }
}
export async function editAreaArtwork(form: FormData) {
  const secret = await token();
  const cart = await ownedCart(createAdminClient(), secret);
  const member = cart?.members.find((b) => b.id === form.get("bookingId"));
  if (
    !secret ||
    !member ||
    member.status !== "pending" ||
    !member.holdExpiresAt ||
    Date.parse(member.holdExpiresAt) <= Date.now()
  )
    redirect("/book/cart");
  (await cookies()).set(
    HOLD_COOKIE,
    cartMemberToken(secret, member.editionId),
    options,
  );
  const upload = String(form.get("uploadId") ?? "");
  redirect(upload ? `/book/artwork?upload=${encodeURIComponent(upload)}` : "/book/artwork");
}
export async function reuseArtwork(form: FormData) {
  const uploadId = await copyCartArtwork(
    createAdminClient(),
    await token(),
    String(form.get("sourceId")),
    String(form.get("bookingId")),
  );
  form.set("uploadId", uploadId);
  await editAreaArtwork(form);
}
export async function releaseAreas() {
  const admin = createAdminClient();
  const cart = await ownedCart(admin, await token());
  if (cart) {
    const { error } = await admin
      .from("bookings")
      .update({ status: "released" })
      .eq("cart_id", cart.id)
      .eq("status", "pending");
    if (error) throw error;
  }
  (await cookies()).delete(CART_COOKIE);
  (await cookies()).delete(HOLD_COOKIE);
  redirect("/book/multi");
}
export async function submitCartContact(
  _previous: ContactFormState,
  form: FormData,
): Promise<ContactFormState> {
  const values = Object.fromEntries(
    [
      "businessName",
      "contactName",
      "email",
      "phone",
      "website",
      "category",
    ].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const admin = createAdminClient();
  const cart = await ownedCart(admin, await token());
  const parsed = parseContact({ ...values, category: cart?.members[0].categoryId ? "" : values.category });
  if (!parsed.ok) return { values, errors: parsed.errors };
  const gate = cart ? cartGate(cart.members) : "no_hold";
  if (gate) return { values, message: gate };
  const c = parsed.contact;
  const categoryId = cart!.members[0].categoryId;
  const category = categoryId ? await admin.from("advertising_categories").select("name").eq("id",categoryId).single() : null;
  if (category?.error || (categoryId && cart!.members.some(b=>b.categoryId!==categoryId))) return { values, message: "error" };
  const { error } = await admin.from("booking_contacts").upsert(
    cart!.members.map((b) => ({
      booking_id: b.id,
      business_name: c.businessName,
      contact_name: c.contactName,
      email: c.email,
      phone: c.phone,
      website: c.website,
      category: category?.data?.name ?? c.category,
    })),
  );
  if (error) return { values, message: "error" };
  redirect("/book/cart/payment");
}
export async function beginCartPayment() {
  if (!checkoutReleased()) return {ok:false as const,reason:"checkout_closed"};
  try {
    return await startCartPayment(
      createAdminClient(),
      getStripe(),
      await token(),
    );
  } catch {
    return { ok: false as const, reason: "error" };
  }
}
export async function giveCartConsent(input: {
  displayedConsent: string;
  accepted: boolean;
  termsVersion: string;
}) {
  if (!checkoutReleased()) return {ok:false as const,reason:"checkout_closed"};
  if (input.accepted !== true || input.termsVersion !== CART_TERMS)
    return { ok: false, reason: "consent_required" };
  const admin = createAdminClient();
  const cart = await ownedCart(admin, await token());
  const gate = cart ? cartGate(cart.members, true) : "no_hold";
  if (gate) return { ok: false, reason: gate };
  const intent = cart!.members.find(
    (b) => b.stripeSetupIntentId,
  )?.stripeSetupIntentId;
  if (!intent) return { ok: false, reason: "payment_not_started" };
  const consentViews=await Promise.all(cart!.members.map(b=>getReservationView(admin,b.id)));
  if(consentViews.some(v=>!v?.campaignName)) return {ok:false,reason:"error"};
  const text=cartConsentText(cart!.members.map((b,i)=>({name:consentViews[i]!.campaignName!,amount:b.priceCents})));
  if (input.displayedConsent !== text) return {ok:false,reason:"terms_changed"};
  const { error } = await admin.from("payment_consents").upsert(
    cart!.members.map((b) => ({
      booking_id: b.id,
      edition_id: b.editionId,
      stripe_setup_intent_id: intent,
      amount_cents: b.priceCents,
      pricing_mode: b.pricingMode,
      currency: "usd",
      terms_version: CART_TERMS,
      consent_text: text,
    })),
    { onConflict: "booking_id,stripe_setup_intent_id", ignoreDuplicates: true },
  );
  if (error) return {ok:false,reason:"error"};
  const saved = await admin.from("payment_consents").select("booking_id,terms_version,consent_text,amount_cents")
    .in("booking_id", cart!.members.map(b=>b.id)).eq("stripe_setup_intent_id", intent);
  if (saved.error) return {ok:false,reason:"error"};
  if (saved.data.length !== cart!.members.length || saved.data.some(row => row.terms_version !== CART_TERMS || row.consent_text !== text ||
    row.amount_cents !== cart!.members.find(b=>b.id===row.booking_id)?.priceCents)) return {ok:false,reason:"terms_changed"};
  return {ok:true};
}
export async function confirmAreas() {
  if (!checkoutReleased()) return {outcome:"checkout_closed"};
  const admin = createAdminClient();
  const cart = await ownedCart(admin, await token());
  if (!cart) return { outcome: "no_hold" };
  try {
    const outcome=await completeCart(admin, getStripe(), cart.id);
    if(outcome==="confirmed"||outcome==="already_confirmed")notifyOwnerAfterResponse();
    return {outcome};
  } catch {
    return { outcome: "error" };
  }
}
export async function simulateCartSetup() {
  if (!isDevTestModeActive())
    return { ok: false, reason: "test_mode_unavailable" };
  const cart = await ownedCart(createAdminClient(), await token());
  const gate = cart ? cartGate(cart.members, true) : "no_hold";
  if (gate) return { ok: false, reason: gate };
  const id = cart!.members.find(
    (b) => b.stripeSetupIntentId,
  )?.stripeSetupIntentId;
  return id && isTestStripeId(id) && fakeStripe.simulateSuccess(id)
    ? { ok: true }
    : { ok: false, reason: "payment_not_started" };
}

export async function extendAreaCheckout() {
 const current=await token();
 if(!current)return {ok:false,message:"Your hold is unavailable."};
 const {hashHoldToken}=await import("@/lib/booking/hold-token");
 const result=await createAdminClient().rpc("extend_cart_hold",{p_hash:hashHoldToken(current)});
 if(result.error)return {ok:false,message:"The extension is unavailable. It can be used once, in the last five minutes, before the campaign deadline."};
 return {ok:true,expiresAt:result.data,message:"All selected areas now share the extended deadline."};
}
