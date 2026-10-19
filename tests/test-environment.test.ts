import { expect, test } from "vitest";
import { assertTestEnvironment } from "../scripts/test-environment";
test("database tests refuse production, mixed URLs, live keys and email delivery", () => {
  const local = { SUPABASE_URL: "http://127.0.0.1:54321" };
  expect(() => assertTestEnvironment(local)).not.toThrow();
  for (const extra of [
    { NEXT_PUBLIC_SUPABASE_URL: "https://hsexthbomretpmqolkqw.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://localhost.evil.example" },
    { STRIPE_SECRET_KEY: "sk_live_x" }, { RESEND_API_KEY: "re_example" },
  ]) expect(() => assertTestEnvironment({ ...local, ...extra })).toThrow(/Refusing/);
  expect(() => assertTestEnvironment({})).toThrow(/require/);
});
