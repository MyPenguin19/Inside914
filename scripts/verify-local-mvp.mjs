// Local native-stack verification. Never reads credentials from .env.local or calls Stripe.
// Usage (repository root): node scripts/verify-local-mvp.mjs test:integration
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const args = process.argv.slice(2);
if (!["typecheck", "lint", "test", "test:integration", "test:e2e", "build"].includes(args[0])) {
  throw new Error("Choose a verification script: typecheck, lint, test, test:integration, test:e2e, build");
}
const runtime = resolve(process.env.SUPABASE_HOME ?? "../supabase-runtime");
const stacks = resolve(runtime, "stacks");
const roots = readdirSync(stacks).filter(name => existsSync(resolve(stacks, name, "state.json")));
if (roots.length !== 1) throw new Error("Exactly one local native Supabase stack is required");
const { credentials } = JSON.parse(readFileSync(resolve(stacks, roots[0], "state.json"), "utf8"));
if (!credentials?.publishableKey || !credentials?.secretKey) throw new Error("Local stack credentials unavailable");
const url = "http://127.0.0.1:54321";
const env = {
  ...process.env, SUPABASE_HOME: runtime,
  SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_ANON_KEY: credentials.publishableKey,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: credentials.publishableKey,
  SUPABASE_SECRET_KEY: credentials.secretKey,
  STRIPE_SECRET_KEY: "", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture", RESEND_API_KEY: "",
  INSIDE914_COLLECTION_MODE: "disabled", INSIDE914_TEST_COLLECTION: "false",
  INSIDE914_DEV_TEST_RESERVATIONS: "true", INSIDE914_PRICING_MODE: "test",
  APP_URL: "http://localhost:3000",
};
const run = spawnSync("npm", ["run", ...args], { env, stdio: "inherit" });
process.exit(run.status ?? 1);
