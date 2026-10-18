import "server-only";
import { z } from "zod";
import { parseEnv } from "./parse";

// Test or LIVE Stripe keys (live approved by the owner, 2026-10-17). Either way the app only saves
// cards with SetupIntents: no code path creates a charge (tests/checkout-text.test.ts).
const SECRET_KEY = /^(sk|rk)_(test|live)_/;
const StripeEnv = z.object({
  STRIPE_SECRET_KEY: z
    .string({ message: "is required for checkout (Stripe Dashboard > Developers > API keys)" })
    .refine((k) => SECRET_KEY.test(k), "must be a Stripe secret key (sk_test_..., sk_live_... or a restricted rk_ key)"),
});

const WebhookEnv = z.object({
  STRIPE_WEBHOOK_SECRET: z
    .string({ message: "is required to accept Stripe webhooks" })
    .refine((k) => k.startsWith("whsec_"), "must be a webhook signing secret (whsec_...)"),
});

export function getStripeEnv() {
  return parseEnv(StripeEnv, { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY });
}

// "test" or "live", from the secret key. The publishable key must be the same mode: a mixed pair
// can't work and is refused rather than failing in the customer's browser.
export function getStripeKeyMode(): "test" | "live" {
  const mode = getStripeEnv().STRIPE_SECRET_KEY.includes("_live_") ? "live" : "test";
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (publishable && !publishable.startsWith(`pk_${mode}_`)) {
    throw new Error(`Invalid environment configuration:\n  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: must be a ${mode} key (pk_${mode}_...) to match STRIPE_SECRET_KEY`);
  }
  return mode;
}

export function getWebhookEnv() {
  return parseEnv(WebhookEnv, { STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET });
}

// Email is optional: without RESEND_API_KEY, confirmation emails stay queued in the outbox.
export function getEmailEnv() {
  return {
    resendApiKey: process.env.RESEND_API_KEY || null,
    from: process.env.EMAIL_FROM || "Inside914 <onboarding@resend.dev>",
    supportEmail: process.env.SUPPORT_EMAIL || "support@inside914.com",
  };
}

// Absolute site URL for links in emails (webhooks have no request to read it from). Production
// requires an https APP_URL: the per-deployment VERCEL_URL changes on every deploy and can sit
// behind Vercel's login, so a customer's link would break. Throwing leaves the email queued.
export function getAppUrl() {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production") {
    if (!appUrl?.startsWith("https://")) {
      throw new Error("Invalid environment configuration:\n  - APP_URL: is required in production (https://..., the public site address)");
    }
    return appUrl;
  }
  if (appUrl) return appUrl;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
