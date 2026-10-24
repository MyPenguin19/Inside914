import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";
import { getCollectionStripe, handlePaymentEvent } from "@/lib/payments/charge";
import Stripe from "stripe";
import { handleStripeEvent } from "@/lib/checkout/webhook";
import { getStripe } from "@/lib/checkout/stripe";
import { getWebhookEnv } from "@/lib/env/checkout";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe webhook. Rejects anything without a valid signature; never logs payloads.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(await request.text(), signature, getWebhookEnv().STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type.startsWith("payment_intent.")) {
      const stripe=getCollectionStripe();
      if(event.livemode !== (stripe.context.mode === "live") || (event.account && event.account !== stripe.context.accountId)) return Response.json({received:true,result:"ignored_mode_or_account"});
      const result=await handlePaymentEvent(createAdminClient(),stripe,event);
      return Response.json({received:true,result});
    }
    const result = await handleStripeEvent(createAdminClient(), getStripe(), event);
    notifyOwnerAfterResponse();
    return Response.json({ received: true, result });
  } catch (error) {
    console.error("stripe webhook failed", event.type, error instanceof Error ? error.message : "unknown");
    return new Response("Webhook handler failed", { status: 500 });
  }
}
