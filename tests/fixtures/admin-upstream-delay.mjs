// Opt-in, test-process-only latency simulation. Never imported by application code.
// Delay local Auth/PostgREST requests so serial database waterfalls are measurable.
import { setTimeout } from "node:timers/promises";

const delay = Number(process.env.INSIDE914_AUDIT_UPSTREAM_DELAY_MS ?? 0);
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || process.env.VERCEL) {
  throw new Error("Admin latency simulation requires a local database outside Vercel");
}
if (!Number.isFinite(delay) || delay < 0 || delay > 1000) throw new Error("Invalid local upstream delay");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (target.origin === url.origin && /^\/(auth|rest)\/v1\//.test(target.pathname)) await setTimeout(delay);
  return originalFetch(input, init);
};
