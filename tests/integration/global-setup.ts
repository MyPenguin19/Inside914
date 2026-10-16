import { execFileSync } from "node:child_process";

// Reads the local stack's URL and public key from `supabase status` unless already set.
export default function setup() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return;

  let status: Record<string, string>;
  try {
    status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
  } catch {
    throw new Error("Local Supabase is not running. Start it with `npx supabase start`.");
  }
  process.env.SUPABASE_URL = status.API_URL;
  process.env.SUPABASE_ANON_KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
}
