import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const processDueOutbox = vi.fn(async () => []);
vi.mock("@/lib/email/outbox", () => ({ processDueOutbox }));
const rpc = vi.fn(async () => ({ data: 1, error: null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
const processDueCardRemovals = vi.fn(async () => ["removed"]);
vi.mock("@/lib/checkout/card-removal", () => ({ processDueCardRemovals }));
vi.mock("@/lib/checkout/stripe", () => ({ getStripe: () => ({}) }));

const { getAppUrl } = await import("@/lib/env/checkout");
const { GET } = await import("@/app/api/internal/email-outbox/route");

afterEach(() => {
  vi.unstubAllEnvs();
  processDueOutbox.mockClear();
  processDueCardRemovals.mockClear();
  rpc.mockClear();
});

describe("getAppUrl (links in emails)", () => {
  test("uses APP_URL without a trailing slash", () => {
    vi.stubEnv("APP_URL", "https://inside914.vercel.app/");
    expect(getAppUrl()).toBe("https://inside914.vercel.app");
  });

  test("production refuses to fall back to the per-deployment URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "inside914-abc123-team.vercel.app");
    expect(() => getAppUrl()).toThrow(/APP_URL/);
  });

  test("production refuses a non-https APP_URL", () => {
    vi.stubEnv("APP_URL", "http://inside914.vercel.app");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getAppUrl()).toThrow(/APP_URL/);
  });

  test("previews may use the deployment URL; local falls back to localhost", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "inside914-abc123-team.vercel.app");
    expect(getAppUrl()).toBe("https://inside914-abc123-team.vercel.app");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("email retry route (Vercel Cron)", () => {
  const call = (authorization?: string) =>
    GET(new Request("http://localhost/api/internal/email-outbox", { headers: authorization ? { authorization } : {} }));

  test("is disabled without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(processDueOutbox).not.toHaveBeenCalled();
  });

  test("refuses a missing or wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-value")).status).toBe(401);
    expect(processDueOutbox).not.toHaveBeenCalled();
    expect(processDueCardRemovals).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("processes due emails with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const response = await call("Bearer s3cret-value");
    expect(response.status).toBe(200);
    expect(processDueOutbox).toHaveBeenCalledTimes(1);
    expect(processDueCardRemovals).toHaveBeenCalledTimes(1); // retries saved-card removal for cancelled reservations
    expect(rpc).toHaveBeenCalledWith("close_past_deadline_campaigns"); // closes campaigns whose deadline passed
    expect(await response.json()).toMatchObject({ campaignsClosed: 1, cardRemovals: ["removed"] });
  });
});
