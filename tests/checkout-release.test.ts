import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { checkoutReleased, PUBLIC_CHECKOUT_RELEASED, assertCheckoutReleased } from "@/lib/checkout/release";
import { createCart, startCartPayment, completeCart } from "@/lib/booking/cart";
import { placeHold } from "@/lib/booking/place-hold";
import { startPayment, recordConsent, completeReservation } from "@/lib/checkout/service";
afterEach(()=>vi.unstubAllEnvs());
test("public release is closed regardless of deployment flags, except isolated development fixtures",()=>{
 expect(PUBLIC_CHECKOUT_RELEASED).toBe(false);
 const local={NODE_ENV:"development",INSIDE914_DEV_TEST_RESERVATIONS:"true",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321"};
 expect(checkoutReleased(local)).toBe(true);
 for(const override of [{NODE_ENV:"production"},{VERCEL:"1"},{VERCEL_ENV:"production"},{NEXT_PUBLIC_SUPABASE_URL:"https://production.supabase.co"},{INSIDE914_DEV_TEST_RESERVATIONS:"false"}]) expect(checkoutReleased({...local,...override})).toBe(false);
 expect(checkoutReleased({PUBLIC_CHECKOUT_RELEASED:"true"})).toBe(false);
});
test("direct hold, consent, setup and confirmation calls fail before DB or Stripe access",async()=>{
 vi.stubEnv("VERCEL_ENV","production");
 expect(assertCheckoutReleased).toThrow("Reservations are not open yet");
 const db=new Proxy({}, {get(){throw new Error("DB must not be touched");}}) as never;
 const stripe=new Proxy({}, {get(){throw new Error("Stripe must not be touched");}}) as never;
 const calls=[()=>createCart(db,[]),()=>placeHold(db,{}),()=>startCartPayment(db,stripe,undefined),()=>completeCart(db,stripe,"fixture"),()=>startPayment(db,stripe,undefined),()=>recordConsent(db,undefined,{}),()=>completeReservation(db,stripe,"fixture")];
 for(const call of calls) await expect(call()).rejects.toThrow("Reservations are not open yet");
});
