// Local native-stack verification. Never reads credentials from .env.local or calls Stripe.
// Usage (repository root): node scripts/verify-local-mvp.mjs test:integration
// If several native stacks exist, set INSIDE914_LOCAL_STACK_ID to the running local stack ID.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const args = process.argv.slice(2);
if (!["typecheck", "lint", "test", "test:integration", "test:e2e", "build"].includes(args[0])) {
  throw new Error("Choose a verification script: typecheck, lint, test, test:integration, test:e2e, build");
}
const runtime = resolve(process.env.SUPABASE_HOME ?? "../supabase-runtime");
const stacks = resolve(runtime, "stacks");
// Multiple local stacks can coexist. An explicit ID selects only a discovered
// stack directory; it cannot supply a path or a remote connection.
const stackId = process.env.INSIDE914_LOCAL_STACK_ID;
const roots = readdirSync(stacks).filter(name => (!stackId || name === stackId) && existsSync(resolve(stacks, name, "state.json")));
if (roots.length !== 1) throw new Error("Select exactly one local native Supabase stack with INSIDE914_LOCAL_STACK_ID");
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
  EMAIL_PAYLOAD_ENCRYPTION_KEY: "a".repeat(64), RESEND_WEBHOOK_SECRET: "", ADMIN_NOTIFICATION_EMAIL: "",
  INSIDE914_COLLECTION_MODE: "disabled", INSIDE914_TEST_COLLECTION: "false",
  INSIDE914_DEV_TEST_RESERVATIONS: "true", INSIDE914_PRICING_MODE: "test",
  APP_URL: "http://localhost:3000",
};
const run = spawnSync("npm", ["run", ...args], { env, stdio: "inherit" });
process.exit(run.status ?? 1);
