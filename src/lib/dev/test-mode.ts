// Development-only TEST reservations (simulated card, no Stripe). Fails closed: every condition
// must hold, so a stray environment variable can never enable it in production or on Vercel.

// Test reservations, integration/e2e tests and dev scripts may only ever touch a LOCAL Supabase
// stack (`npx supabase start`). The hosted Inside914 project is PRODUCTION.
const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function isLocalSupabaseUrl(url: string | undefined) {
  try {
    return LOCAL_SUPABASE_HOSTS.has(new URL(url ?? "").hostname);
  } catch {
    return false;
  }
}

export const DEV_TEST_PREFIX = "devtest";
export const DEV_TEST_FLAG = "INSIDE914_DEV_TEST_RESERVATIONS";

type Env = Record<string, string | undefined>;

export function devTestMode(env: Env = process.env): { active: boolean; reason: string } {
  if (env[DEV_TEST_FLAG] !== "true") return { active: false, reason: "flag_off" };
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") return { active: false, reason: "not_development_build" };
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return { active: false, reason: "running_on_vercel" };
  let host = "";
  try {
    host = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return { active: false, reason: "unknown_database" };
  }
  if (!LOCAL_SUPABASE_HOSTS.has(host)) return { active: false, reason: "not_dev_database" };
  return { active: true, reason: "ok" };
}

let warned = false;

export function isDevTestModeActive(env: Env = process.env) {
  const mode = devTestMode(env);
  if (!mode.active && env[DEV_TEST_FLAG] === "true" && !warned) {
    warned = true;
    console.warn(`${DEV_TEST_FLAG} is set but test reservations stay OFF here (${mode.reason}).`);
  }
  return mode.active;
}

// A booking made in test mode carries fake Stripe ids with the devtest prefix.
export function isTestStripeId(id: string | null | undefined) {
  return !!id && new RegExp(`^(cus|seti|pm)_${DEV_TEST_PREFIX}_`).test(id);
}
