import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CART_COOKIE, ownedCart, completeCart } from "@/lib/booking/cart";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/checkout/stripe";
export async function GET(request: Request) {
  const admin = createAdminClient();
  const cart = await ownedCart(
    admin,
    (await cookies()).get(CART_COOKIE)?.value,
  );
  if (cart) {
    const outcome = await completeCart(admin, getStripe(), cart.id);
    if (outcome === "confirmed" || outcome === "already_confirmed")
      return NextResponse.redirect(new URL("/book/cart", request.url));
  }
  return NextResponse.redirect(new URL("/book/cart/payment", request.url));
}
