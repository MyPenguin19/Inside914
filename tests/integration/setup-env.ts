import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isLocalSupabaseUrl } from "@/lib/dev/test-mode";

// Runs in each test worker before the test file loads. Integration tests create and delete real
// rows, so they run ONLY against a local Supabase stack (`npx supabase start`): the hosted
// Inside914 project is production. Supabase settings come from `supabase status`, never from
// .env.local; SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY set in the shell may point at
// another local stack. (Read before .env.local is loaded, so its values can't sneak in.)
const shell = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, secret: process.env.SUPABASE_SECRET_KEY };
if (existsSync(".env.local")) process.loadEnvFile(".env.local"); // other settings (e.g. Stripe test keys)
// Integration tests exercise the temporary TEST pricing unless a run sets the mode explicitly.
process.env.INSIDE914_PRICING_MODE ||= "test";

if (!shell.url || !shell.anon) {
  let status: Record<string, string> = {};
  try {
    status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
  } catch {
    // handled below
  }
  if (!status.API_URL) throw new Error("Integration tests need the local Supabase stack: run `npx supabase start` (needs OrbStack/Docker).");
  shell.url = status.API_URL;
  shell.anon = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  shell.secret = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
}

if (!isLocalSupabaseUrl(shell.url)) {
  throw new Error(`Refusing to run integration tests against ${shell.url}: only a local Supabase stack is allowed (the hosted project is production).`);
}
process.env.SUPABASE_URL = shell.url;
process.env.SUPABASE_ANON_KEY = shell.anon;
process.env.NEXT_PUBLIC_SUPABASE_URL = shell.url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = shell.anon;
// Never keep .env.local's secret key: it belongs to whatever project .env.local points at.
if (shell.secret) process.env.SUPABASE_SECRET_KEY = shell.secret;
else delete process.env.SUPABASE_SECRET_KEY;
