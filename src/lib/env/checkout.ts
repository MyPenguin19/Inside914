import "server-only";
import { z } from "zod";
import { parseEnv } from "./parse";

// Stripe is TEST MODE ONLY until live payments are explicitly approved: live keys are refused.
const StripeEnv = z.object({
  STRIPE_SECRET_KEY: z
    .string({ message: "is required for checkout (Stripe Dashboard > Developers > API keys, Test mode)" })
    .refine((k) => k.startsWith("sk_test_") || k.startsWith("rk_test_"), "must be a TEST key (sk_test_...); live keys are not allowed yet"),
});

const WebhookEnv = z.object({
  STRIPE_WEBHOOK_SECRET: z
    .string({ message: "is required to accept Stripe webhooks" })
    .refine((k) => k.startsWith("whsec_"), "must be a webhook signing secret (whsec_...)"),
});

export function getStripeEnv() {
  return parseEnv(StripeEnv, { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY });
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

// Absolute site URL for links in emails (webhooks have no request to read it from).
export function getAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
