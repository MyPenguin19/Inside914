import { connection } from "next/server";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_COOKIE,resolveRecovery } from "@/lib/payments/recovery";
import { getCollectionStripe,verifyIntent,verifyLedgerContext,verifyStripeAccount } from "@/lib/payments/charge";
import { RecoveryForm } from "@/components/payments/recovery-form";
import { Card } from "@/components/ui/primitives";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const metadata={title:"Payment recovery · Inside914",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default function PayPage(){return <><SiteHeader/><main className="page-width flex-1 py-8"><Suspense fallback={<p>Loading payment status…</p>}><Payment/></Suspense></main><SiteFooter/></>;}
async function Payment(){
  await connection();
  let details;
  try {
    const stripe=getCollectionStripe(),db=createAdminClient();
    const charge=await resolveRecovery(db,(await cookies()).get(PAYMENT_COOKIE)?.value);
    if(charge?.payment_intent_id){
      verifyLedgerContext(charge,stripe.context);
      await verifyStripeAccount(stripe);
      const intent=await stripe.paymentIntents.retrieve(charge.payment_intent_id);verifyIntent(charge,intent);
      const {data:edition}=await db.from("editions").select("name,zones(name)").eq("id",charge.edition_id).single();
      details={intent,name:edition?.name ?? edition?.zones?.name ?? "Your zone"};
    }
  }catch{details=null;}
  if(!details)return <Card><h1 className="text-2xl font-semibold">Payment link unavailable</h1><p className="mt-2">This link may be expired, replaced, or already paid. Contact Inside914 for assistance.</p></Card>;
  const {intent,name}=details;
  return <Card className="mx-auto max-w-xl"><h1 className="text-2xl font-semibold">{name}</h1><p className="mt-2">$399 for this zone only{!intent.livemode && " · Stripe test mode"}</p>
    {["requires_action","requires_payment_method"].includes(intent.status) && intent.client_secret ? <RecoveryForm mode={intent.livemode ? "live" : "test"} clientSecret={intent.client_secret} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!} requiresAction={intent.status==="requires_action"}/> : <p className="mt-4">{intent.status==="succeeded" ? "Payment received by Stripe. Confirmation is being recorded." : "Payment is processing. No additional payment is needed."}</p>}
  </Card>;
}
