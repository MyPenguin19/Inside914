import {afterEach,expect,test,vi} from "vitest";
vi.mock("server-only",()=>({}));
// Exercise the retained server-side shutdown path independently of today's approval.
vi.mock("@/lib/legal/release",()=>({RESERVATION_POLICY:{approvedForReservations:false}}));
const blocked=vi.hoisted(()=>vi.fn(()=>{throw new Error("No infrastructure access allowed");}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:blocked}));
vi.mock("@/lib/checkout/stripe",()=>({getStripe:blocked}));
vi.mock("next/headers",()=>({cookies:blocked,headers:blocked}));
vi.mock("@/lib/operations/notify-after",()=>({notifyOwnerAfterResponse:blocked}));
import {holdAreas,beginCartPayment,giveCartConsent,confirmAreas} from "@/app/book/cart/actions";
import {beginPayment,giveConsent,confirmReservation} from "@/app/(public)/actions/checkout";
import {CHECKOUT_CLOSED_MESSAGE,checkoutMessage} from "@/lib/checkout/messages";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
test.each([
 ["area hold",()=>holdAreas({selections:[]}),{ok:false,message:CHECKOUT_CLOSED_MESSAGE}],
 ["single setup",()=>beginPayment(),{ok:false,reason:"checkout_closed"}],
 ["cart setup",()=>beginCartPayment(),{ok:false,reason:"checkout_closed"}],
 ["single consent",()=>giveConsent({accepted:true,termsVersion:"draft",displayedConsent:"draft"}),{ok:false,reason:"checkout_closed"}],
 ["cart consent",()=>giveCartConsent({accepted:true,termsVersion:"draft",displayedConsent:"draft"}),{ok:false,reason:"checkout_closed"}],
 ["single confirmation",()=>confirmReservation(),{outcome:"checkout_closed"}],
 ["cart confirmation",()=>confirmAreas(),{outcome:"checkout_closed"}],
] as const)("%s returns a neutral release refusal without throwing or accessing infrastructure",async(_name,call,expected)=>{
 vi.stubEnv("VERCEL_ENV","production");
 await expect(call()).resolves.toEqual(expected);
 expect(blocked).not.toHaveBeenCalled();
 expect(checkoutMessage("checkout_closed")).toBe(CHECKOUT_CLOSED_MESSAGE);
});
