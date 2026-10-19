import { assertTestEnvironment } from "../../scripts/test-environment";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Runs in each test worker before the test file loads. Uses SUPABASE_URL / SUPABASE_ANON_KEY if set,
// then the NEXT_PUBLIC_* values from .env.local, then the local stack from `supabase status`.
// SUPABASE_SECRET_KEY comes from .env.local. (Next's loadEnvConfig skips .env.local under NODE_ENV=test.)
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// Integration tests exercise the temporary TEST pricing unless a run sets the mode explicitly.
process.env.INSIDE914_PRICING_MODE ||= "test";
// Guarded: assigning undefined to process.env stores the string "undefined".
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!process.env.SUPABASE_URL && NEXT_PUBLIC_SUPABASE_URL) process.env.SUPABASE_URL = NEXT_PUBLIC_SUPABASE_URL;
if (!process.env.SUPABASE_ANON_KEY && NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  process.env.SUPABASE_ANON_KEY = NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  let status: Record<string, string> = {};
  try {
    status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
  } catch {
    // handled below
  }
  if (!status.API_URL) {
    throw new Error("No Supabase configured: set .env.local (see .env.example) or run `npx supabase start`.");
  }
  process.env.SUPABASE_URL = status.API_URL;
  process.env.SUPABASE_ANON_KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
}

assertTestEnvironment();
