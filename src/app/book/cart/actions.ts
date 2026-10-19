"use server";
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
import { createCategoryCart } from "@/lib/booking/category-checkout";
const token = async () => (await cookies()).get(CART_COOKIE)?.value;
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 86400,
};
export async function holdAreas(raw: unknown) {
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
    const cart = await createCategoryCart(admin, raw);
    (await cookies()).set(CART_COOKIE, cart.token, options);
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
  const member = cart?.members[0]?.productModel === "square_v1" ? cart.members[0] : cart?.members.find((b) => b.id === form.get("bookingId"));
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
  redirect("/book/artwork");
}
export async function reuseArtwork(form: FormData) {
  const current = await ownedCart(createAdminClient(),await token());
  if (current?.members.some(b=>b.productModel === "square_v1")) redirect("/book/cart");
  await copyCartArtwork(
    createAdminClient(),
    await token(),
    String(form.get("sourceId")),
    String(form.get("bookingId")),
  );
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
  accepted: boolean;
  termsVersion: string;
}) {
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
  const { error } = await admin.from("payment_consents").upsert(
    cart!.members.map((b) => ({
      booking_id: b.id,
      edition_id: b.editionId,
      stripe_setup_intent_id: intent,
      amount_cents: b.priceCents,
      pricing_mode: b.pricingMode,
      currency: "usd",
      terms_version: CART_TERMS,
    })),
    { onConflict: "booking_id,stripe_setup_intent_id", ignoreDuplicates: true },
  );
  return error ? { ok: false, reason: "error" } : { ok: true };
}
export async function confirmAreas() {
  const admin = createAdminClient();
  const cart = await ownedCart(admin, await token());
  if (!cart) return { outcome: "no_hold" };
  try {
    return { outcome: await completeCart(admin, getStripe(), cart.id) };
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
