import "server-only";
import Stripe from "stripe";
import { getStripeEnv } from "@/lib/env/checkout";

let client: Stripe | null = null;

// Server-side Stripe client (secret key never leaves the server). Test mode only; see env/checkout.
export function getStripe() {
  client ??= new Stripe(getStripeEnv().STRIPE_SECRET_KEY, {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 2,
    appInfo: { name: "Inside914" },
  });
  return client;
}

export type StripeClient = Pick<Stripe, "customers" | "setupIntents" | "paymentMethods">;
