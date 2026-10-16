import "server-only";
import Stripe from "stripe";
import { fakeStripe } from "@/lib/dev/fake-stripe";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
import { getStripeEnv } from "@/lib/env/checkout";

let client: Stripe | null = null;

export type StripeClient = Pick<Stripe, "customers" | "setupIntents" | "paymentMethods">;

// Server-side Stripe client (secret key never leaves the server). Test-mode keys only; see
// env/checkout. In a local development environment with TEST reservations enabled (see
// dev/test-mode, which fails closed), a fake that cannot charge is used instead.
export function getStripe(): StripeClient {
  if (isDevTestModeActive()) return fakeStripe as unknown as StripeClient;
  client ??= new Stripe(getStripeEnv().STRIPE_SECRET_KEY, {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 2,
    appInfo: { name: "Inside914" },
  });
  return client;
}
