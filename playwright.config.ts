import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertTestEnvironment } from "./scripts/test-environment";
import { defineConfig, devices } from "@playwright/test";
import { isLocalSupabaseUrl } from "./src/lib/dev/test-mode";

// e2e specs place holds, create users and campaigns: they run ONLY against a local Supabase stack
// (`npx supabase start`). The hosted Inside914 project is production. Shell values win over .env.local.
loadEnvConfig(process.cwd());
if (!isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error(
    `Refusing to run e2e tests against ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "no database"}: point NEXT_PUBLIC_SUPABASE_URL at the local stack (the hosted project is production).`,
  );
}

assertTestEnvironment();

const baseURL = "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./tests/fixtures/setup-local-catalog.ts",
  forbidOnly: !!process.env.CI,
  workers: 1, // specs place real holds on one database; run them one at a time
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The app reads Supabase settings from .env.local, or from these when set in the shell.
  webServer: {
    command: process.env.INSIDE914_E2E_PRODUCTION === "true" ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...(process.env.INSIDE914_AUDIT_UPSTREAM_DELAY_MS ? {
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(resolve("tests/fixtures/admin-upstream-delay.mjs")).href}`,
      } : {}),
      ...Object.fromEntries(
        ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "INSIDE914_DEV_TEST_RESERVATIONS"].flatMap((key) =>
          process.env[key] ? [[key, process.env[key]!]] : [],
        ),
      ),
      INSIDE914_HOLD_ATTEMPTS_MAX: "1000", // the suite places many holds from one address
      INSIDE914_PRICING_MODE: "test", // the e2e suite checks the temporary $1 / $2 prices
    },
  },
});
