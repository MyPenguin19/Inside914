// All database-mutating suites are local-only. Check every URL used by app and tests.
export function assertTestEnvironment(env: Record<string, string | undefined> = process.env) {
  const urls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean);
  if (!urls.length) throw new Error("Tests require an isolated local Supabase URL");
  for (const value of urls) {
    const url = new URL(value!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.protocol !== "http:") {
      throw new Error("Refusing database tests: only local HTTP Supabase is allowed; production and remote projects are forbidden");
    }
  }
  if (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "") || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
    throw new Error("Refusing tests with live Stripe credentials");
  }
  if (env.RESEND_API_KEY) throw new Error("Refusing tests with a Resend delivery key; use mocked email");
}
