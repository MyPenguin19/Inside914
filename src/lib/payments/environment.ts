import { isLocalSupabaseUrl } from "@/lib/dev/test-mode";

type Env = Record<string, string | undefined>;
export type CollectionMode = "disabled" | "test" | "live";

// A release decision, not an environment toggle. Live collection stays unavailable
// until provider verification and operational readiness are approved.
export const LIVE_COLLECTION_RELEASED = false;

export function collectionMode(env: Env = process.env): CollectionMode {
  const mode = env.INSIDE914_COLLECTION_MODE ?? "disabled";
  if (mode !== "disabled" && mode !== "test" && mode !== "live") {
    throw new Error("Invalid collection mode");
  }
  return mode;
}

// Pure validation for a future release. This never constructs a Stripe client,
// enables collection, or verifies credentials with Stripe.
export function validateCollectionCredentials(mode: "test" | "live", env: Env = process.env) {
  if (!new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(env.STRIPE_SECRET_KEY ?? "") ||
      !new RegExp(`^pk_${mode}_[A-Za-z0-9]+$`).test(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "")) {
    throw new Error(`Matching Stripe ${mode} keys are required for collection`);
  }
  if (mode === "live") {
    if (env.INSIDE914_PRICING_MODE !== "launch") throw new Error("Live collection requires launch pricing");
    if (env.INSIDE914_DEV_TEST_RESERVATIONS === "true" || env.INSIDE914_TEST_COLLECTION === "true") {
      throw new Error("Live collection cannot use simulated reservations or test collection");
    }
    if (!/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET ?? "")) throw new Error("Live collection requires a webhook signing secret");
    const url = new URL(env.APP_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("Live collection requires a public HTTPS application URL");
    }
  }
}

export function assertCollectionEnvironment(env: Env = process.env) {
  const mode = collectionMode(env);
  if (mode === "disabled") throw new Error("Payment collection is disabled");
  if (mode === "live") {
    // Compile-time release gate: environment changes alone cannot enable live payments.
    if (!LIVE_COLLECTION_RELEASED) throw new Error("Live collection is not released");
    validateCollectionCredentials("live", env);
    const database = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (env.NODE_ENV !== "production" || env.VERCEL_ENV !== "production" || database.protocol !== "https:" || isLocalSupabaseUrl(database.href)) {
      throw new Error("Live collection requires the approved production runtime");
    }
    return;
  }
  if (env.INSIDE914_TEST_COLLECTION !== "true" || !isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL) || env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) {
    throw new Error("Collection is restricted to explicitly enabled local tests");
  }
  validateCollectionCredentials("test", env);
}

export type CollectionContext = { mode: "test" | "live"; accountId: string };
export function getCollectionContext(env: Env = process.env): CollectionContext {
  assertCollectionEnvironment(env);
  if (!/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_ACCOUNT_ID ?? "")) throw new Error("Stripe account binding is required");
  return {mode: collectionMode(env) as "test" | "live", accountId: env.STRIPE_ACCOUNT_ID!};
}
