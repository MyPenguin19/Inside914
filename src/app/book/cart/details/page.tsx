import { CartHoldTimer } from "@/components/booking/cart-hold-timer";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookingSteps } from "@/components/booking/booking-steps";
import { ContactForm } from "@/components/checkout/contact-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { CART_COOKIE, ownedCart, cartGate } from "@/lib/booking/cart";
import { submitCartContact } from "../actions";
export default function Page() {
  return <><SiteHeader /><main className="page-width flex-1 py-8"><BookingSteps current={3} /><Suspense fallback={<p>Loading business details…</p>}><Details /></Suspense></main><SiteFooter /></>;
}
async function Details() {
  const cart = await ownedCart(createAdminClient(), (await cookies()).get(CART_COOKIE)?.value);
  if (!cart || cartGate(cart.members)) redirect("/book/cart");
  const contact = cart.members[0].contact;
  return <section className="mt-6 max-w-xl space-y-5"><CartHoldTimer expiresAt={cart.members.map(b=>b.holdExpiresAt!).sort()[0]}/><h1 className="text-3xl font-semibold">Your business details</h1>
    <p>Use one contact for all selected areas. We’ll contact you if we need help with your advertisement.</p>
    <ContactForm action={submitCartContact} hideCategory initial={{ businessName: contact?.business_name ?? "", contactName: contact?.contact_name ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", website: contact?.website ?? "", category: "" }} />
    <Link href="/book/cart" className="underline">Back to artwork</Link></section>;
}
