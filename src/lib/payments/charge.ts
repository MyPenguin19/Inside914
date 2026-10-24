import "server-only";
import Stripe from "stripe";
import { assertBookingCollection } from "./booking-authorization";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ZoneChargeRow } from "@/lib/supabase/database.types";
import { getCollectionContext, type CollectionContext } from "./environment";
export type PaymentStripe = Pick<Stripe,"paymentIntents" | "accounts" | "customers" | "paymentMethods"> & { context: CollectionContext };
type Db = SupabaseClient<Database>;
export function getCollectionStripe(): PaymentStripe {
  const context=getCollectionContext();
  return Object.assign(new Stripe(process.env.STRIPE_SECRET_KEY!,{apiVersion:"2026-09-30.endive",maxNetworkRetries:2}),{context});
}
export function verifyIntent(c: ZoneChargeRow, intent: Stripe.PaymentIntent) {
  const customer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
  if (intent.livemode !== (c.stripe_mode === "live") || intent.amount !== c.amount_cents || intent.currency !== "usd" || customer !== c.customer_id ||
    intent.metadata.zone_charge_id !== c.id || intent.metadata.booking_id !== c.booking_id || intent.metadata.edition_id !== c.edition_id ||
    (c.payment_intent_id && c.payment_intent_id !== intent.id)) throw new Error("PaymentIntent does not match authorized zone reservation");
}
export function verifyLedgerContext(c: ZoneChargeRow, context: CollectionContext) {
  if (c.stripe_mode !== context.mode || c.stripe_account_id !== context.accountId) throw new Error("Payment ledger mode/account mismatch");
}
export async function verifyStripeAccount(stripe: PaymentStripe) {
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== stripe.context.accountId) throw new Error("Stripe account does not match configured binding");
}
// Only module allowed to create/confirm server-side payments. Never called at reservation.
export async function collectCharge(db: Db, stripe: PaymentStripe, chargeId: string) {
  const {data:c,error}=await db.from("zone_charges").select("*").eq("id",chargeId).single();
  if(error || !c) throw new Error("Charge ledger missing");
  verifyLedgerContext(c,stripe.context);
  if(c.status === "succeeded") return "succeeded";
  if (/devtest/.test(c.customer_id+c.payment_method_id)) throw new Error("Simulated reservations cannot be sent to Stripe");
  const consent=await db.rpc("assert_charge_consent",{p_charge:c.id});
  if(consent.error) throw new Error("Consent review required before collection");
  await assertBookingCollection(db, c.booking_id);
  await verifyStripeAccount(stripe);
  let intent: Stripe.PaymentIntent;
  if(c.payment_intent_id) intent=await stripe.paymentIntents.retrieve(c.payment_intent_id);
  else {
    // Stripe expires idempotency keys after at least 24h. Never recreate an unknown
    // intent outside that window; require manual reconciliation instead.
    if(Date.now()-Date.parse(c.created_at)>23*3600_000) throw new Error("Unknown payment creation requires reconciliation; no new intent created");
    const customer=await stripe.customers.retrieve(c.customer_id);
    const method=await stripe.paymentMethods.retrieve(c.payment_method_id);
    const owner=typeof method.customer === "string" ? method.customer : method.customer?.id;
    if (customer.deleted || customer.livemode !== (c.stripe_mode === "live") || method.livemode !== (c.stripe_mode === "live") || owner !== c.customer_id) throw new Error("Saved payment method mode/ownership mismatch");
    await assertBookingCollection(db, c.booking_id);
    intent=await stripe.paymentIntents.create({amount:c.amount_cents,currency:"usd",customer:c.customer_id,payment_method:c.payment_method_id,
      automatic_payment_methods:{enabled:true,allow_redirects:"never"},
      metadata:{zone_charge_id:c.id,booking_id:c.booking_id,edition_id:c.edition_id,consent_id:c.consent_id}},
      {idempotencyKey:`zone-create-${c.id}`});
    verifyIntent(c,intent);
    const {error:saveError}=await db.from("zone_charges").update({payment_intent_id:intent.id}).eq("id",c.id).is("payment_intent_id",null);
    if(saveError) throw new Error("Could not persist PaymentIntent; retry with the same ledger");
  }
  verifyIntent(c,intent);
  if(intent.status === "requires_confirmation") {
    await assertBookingCollection(db, c.booking_id);
    try { intent=await stripe.paymentIntents.confirm(intent.id,{off_session:true},{idempotencyKey:`zone-initial-confirm-${c.id}`}); }
    catch(error) {
      // Declines/authentication requirements still belong to this same intent.
      if (!(error instanceof Stripe.errors.StripeCardError)) throw error;
      intent=await stripe.paymentIntents.retrieve(intent.id);
    }
    verifyIntent(c,intent);
  }
  // Webhook is the source of truth; synchronous responses never mark a booking paid.
  return intent.status;
}
export async function handlePaymentEvent(db: Db,stripe: PaymentStripe,event: Stripe.Event) {
  if(event.livemode !== (stripe.context.mode === "live") || (event.account && event.account !== stripe.context.accountId) || !["payment_intent.succeeded","payment_intent.payment_failed","payment_intent.requires_action","payment_intent.processing","payment_intent.canceled"].includes(event.type)) return "ignored";
  const payload=event.data.object as Stripe.PaymentIntent;
  const id=payload.metadata?.zone_charge_id;
  if(!id || !/^[0-9a-f-]{36}$/i.test(id)) return "ignored";
  const {data:c,error}=await db.from("zone_charges").select("*").eq("id",id).maybeSingle();
  if(error) throw new Error("Could not load payment ledger");
  if(!c) return "ignored";
  verifyLedgerContext(c,stripe.context);
  await verifyStripeAccount(stripe);
  const intent=await stripe.paymentIntents.retrieve(payload.id);
  verifyIntent(c,intent);
  if(!["succeeded","processing","requires_action","requires_payment_method","canceled"].includes(intent.status)) return "ignored";
  const {data,error:recordError}=await db.rpc("record_zone_payment",{p_mode:c.stripe_mode,p_account:stripe.context.accountId,p_charge:c.id,p_intent:intent.id,p_status:intent.status,p_event:event.id,p_created:event.created,p_failure:intent.last_payment_error?.code});
  if(recordError) throw new Error("Could not record payment event");
  return data;
}
